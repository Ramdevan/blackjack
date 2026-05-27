// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @dev Interface of the ERC20 standard token for casino chips.
 */
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title MultiplayerBlackJack
 * @dev A fully decentralized turn-based Multiplayer Blackjack game contract with native Split support.
 * Multiple players can join a single table, place their bets, and play against a single,
 * synchronized dealer hand. Turn timeouts are enforced to prevent inactive players from locking tables.
 */
contract BlackJackCard {
    // --- ERC20 Token & Admin ---
    IERC20 public chipToken;
    address public owner;

    // --- Game Rules & Settings ---
    uint256 public minBet = 10 * 10**18; // Default minimum bet (e.g. 10 CHIPS)
    uint256 public maxBet = 1000 * 10**18; // Default maximum bet (e.g. 1000 CHIPS)
    uint256 public turnTimeoutDuration = 60; // In seconds (default: 60 seconds per turn)

    enum TableState { Betting, Playing, Settling, Finished }

    struct PlayerBet {
        address player;
        uint256 betAmount;
        uint8[] cards;
        uint8 score;
        bool stood;
        bool busted;
        bool settled;
        bool doubledDown;
       
        // --- Split Hand State ---
        bool isSplit;
        uint8[] splitCards;
        uint8 splitScore;
        bool splitStood;
        bool splitBusted;
        uint256 splitBetAmount;
        uint8 activeHandIndex; // 0 for primary hand, 1 for split hand
    }

    struct Table {
        uint256 tableId;
        TableState state;
        address[] activePlayers;
        mapping(address => PlayerBet) bets;
        uint8[] dealerCards;
        uint8 dealerScore;
        uint256 currentTurnIndex;
        uint256 lastActionTimestamp;
    }

    uint256 public tableCounter;
    mapping(uint256 => Table) public tables;

    // --- Reentrancy Guard ---
    uint8 private unlocked = 1;
    modifier nonReentrant() {
        require(unlocked == 1, "REENTRANCY_GUARD");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    // --- Modifiers ---
    modifier onlyOwner() {
        require(msg.sender == owner, "Caller is not the owner");
        _;
    }

    // --- Events ---
    event TableCreated(uint256 indexed tableId);
    event BetPlaced(uint256 indexed tableId, address indexed player, uint256 betAmount);
    event RoundStarted(uint256 indexed tableId, uint8[] dealerCards);
    event PlayerAction(uint256 indexed tableId, address indexed player, string action, uint8[] cards, uint8 score);
    event TableSettled(uint256 indexed tableId, uint8[] dealerCards, uint8 dealerScore);
    event TimeoutTriggered(uint256 indexed tableId, address indexed timedOutPlayer, address indexed triggerer);
    event RulesUpdated(uint256 minBet, uint256 maxBet, uint256 turnTimeoutDuration);
    event TokensWithdrawn(address token, uint256 amount);

    constructor(address _chipToken) {
        require(_chipToken != address(0), "Invalid token address");
        chipToken = IERC20(_chipToken);
        owner = msg.sender;
    }

    /**
     * @dev Create a new multiplayer table.
     */
    function createTable() external returns (uint256) {
        tableCounter++;
        Table storage t = tables[tableCounter];
        t.tableId = tableCounter;
        t.state = TableState.Betting;
        t.lastActionTimestamp = block.timestamp;
        emit TableCreated(tableCounter);
        return tableCounter;
    }

    /**
     * @dev Join a table and place a bet.
     */
    function placeBet(uint256 tableId, uint256 betAmount) external nonReentrant {
        Table storage t = tables[tableId];
        require(t.state == TableState.Betting, "Table is not in betting phase");
        require(betAmount >= minBet, "Bet amount below minimum limit");
        require(betAmount <= maxBet, "Bet amount exceeds maximum limit");
        require(t.bets[msg.sender].betAmount == 0, "Already placed a bet on this table");

        // Transfer chips to contract
        require(chipToken.transferFrom(msg.sender, address(this), betAmount), "Token transfer failed");

        t.activePlayers.push(msg.sender);
        t.bets[msg.sender] = PlayerBet({
            player: msg.sender,
            betAmount: betAmount,
            cards: new uint8[](0),
            score: 0,
            stood: false,
            busted: false,
            settled: false,
            doubledDown: false,
            isSplit: false,
            splitCards: new uint8[](0),
            splitScore: 0,
            splitStood: false,
            splitBusted: false,
            splitBetAmount: 0,
            activeHandIndex: 0
        });

        t.lastActionTimestamp = block.timestamp;
        emit BetPlaced(tableId, msg.sender, betAmount);
    }

    /**
     * @dev Start the round. Deals initial 2 cards to each player and 1 visible card (plus 1 face-down represented by 0) to the dealer.
     */
    function startRound(uint256 tableId) external {
        Table storage t = tables[tableId];
        require(t.state == TableState.Betting, "Round cannot be started (Not in betting phase)");
        require(t.activePlayers.length > 0, "No players seated at this table");

        t.state = TableState.Playing;
        t.currentTurnIndex = 0;
        t.lastActionTimestamp = block.timestamp;

        bytes32 seed = keccak256(abi.encodePacked(block.timestamp, block.prevrandao, tableId));
        uint256 nonce = 0;

        // Deal 2 initial cards to each player
        for (uint256 i = 0; i < t.activePlayers.length; i++) {
            address player = t.activePlayers[i];
            PlayerBet storage pb = t.bets[player];
            pb.cards.push(getRandomCard(seed, nonce++));
            pb.cards.push(getRandomCard(seed, nonce++));
            pb.score = calculateScore(pb.cards);

            // Check for natural Blackjack (21 on initial deal)
            if (pb.score == 21) {
                pb.stood = true;
                emit PlayerAction(tableId, player, "blackjack", pb.cards, pb.score);
            } else {
                emit PlayerAction(tableId, player, "deal", pb.cards, pb.score);
            }
        }

        // Deal 1 visible card to dealer and 1 face-down (0)
        t.dealerCards.push(getRandomCard(seed, nonce++));
        t.dealerCards.push(0);
        emit RoundStarted(tableId, t.dealerCards);

        // If all players got dealt a natural Blackjack, auto-transition straight to settlement
        if (allPlayersFinished(tableId)) {
            t.state = TableState.Settling;
            _settleTable(tableId);
        } else {
            // Find first player who is not stood already (e.g. didn't get blackjack)
            while (t.currentTurnIndex < t.activePlayers.length) {
                address currentPlayer = t.activePlayers[t.currentTurnIndex];
                if (t.bets[currentPlayer].stood) {
                    t.currentTurnIndex++;
                } else {
                    break;
                }
            }
            if (t.currentTurnIndex >= t.activePlayers.length) {
                t.state = TableState.Settling;
                _settleTable(tableId);
            }
        }
    }

    /**
     * @dev Request a Hit card for the active turn player's active hand.
     */
    function hit(uint256 tableId) external {
        Table storage t = tables[tableId];
        require(t.state == TableState.Playing, "Game round is not active");
        address activePlayer = t.activePlayers[t.currentTurnIndex];
        require(msg.sender == activePlayer, "Not your turn");
        PlayerBet storage pb = t.bets[msg.sender];

        bytes32 seed = keccak256(abi.encodePacked(block.timestamp, msg.sender, pb.cards.length, pb.splitCards.length));
        uint8 newCard = getRandomCard(seed, 1);
        t.lastActionTimestamp = block.timestamp;

        if (pb.isSplit) {
            if (pb.activeHandIndex == 0) {
                require(!pb.stood && !pb.busted, "Left hand turn already completed");
                pb.cards.push(newCard);
                pb.score = calculateScore(pb.cards);

                if (pb.score > 21) {
                    pb.busted = true;
                    emit PlayerAction(tableId, msg.sender, "bust_left", pb.cards, pb.score);
                    pb.activeHandIndex = 1; // Auto-transition to right hand
                } else {
                    emit PlayerAction(tableId, msg.sender, "hit_left", pb.cards, pb.score);
                }
            } else {
                require(!pb.splitStood && !pb.splitBusted, "Right hand turn already completed");
                pb.splitCards.push(newCard);
                pb.splitScore = calculateScore(pb.splitCards);

                if (pb.splitScore > 21) {
                    pb.splitBusted = true;
                    emit PlayerAction(tableId, msg.sender, "bust_right", pb.splitCards, pb.splitScore);
                    advanceTurn(tableId);
                } else {
                    emit PlayerAction(tableId, msg.sender, "hit_right", pb.splitCards, pb.splitScore);
                }
            }
        } else {
            require(!pb.stood && !pb.busted, "Turn already completed");
            pb.cards.push(newCard);
            pb.score = calculateScore(pb.cards);

            if (pb.score > 21) {
                pb.busted = true;
                emit PlayerAction(tableId, msg.sender, "bust", pb.cards, pb.score);
                advanceTurn(tableId);
            } else {
                emit PlayerAction(tableId, msg.sender, "hit", pb.cards, pb.score);
            }
        }
    }

    /**
     * @dev Double down on initial 2 cards of the active hand.
     */
    function doubleDown(uint256 tableId) external nonReentrant {
        Table storage t = tables[tableId];
        require(t.state == TableState.Playing, "Game round is not active");
        address activePlayer = t.activePlayers[t.currentTurnIndex];
        require(msg.sender == activePlayer, "Not your turn");
        PlayerBet storage pb = t.bets[msg.sender];

        bytes32 seed = keccak256(abi.encodePacked(block.timestamp, msg.sender, pb.cards.length, pb.splitCards.length, "doubledown"));
        uint8 newCard = getRandomCard(seed, 1);
        t.lastActionTimestamp = block.timestamp;

        if (pb.isSplit) {
            if (pb.activeHandIndex == 0) {
                require(!pb.stood && !pb.busted, "Left hand turn already completed");
                require(pb.cards.length == 2, "Can only double down on initial 2 cards");
                uint256 additionalBet = pb.betAmount;
                require(pb.betAmount * 2 <= maxBet, "Doubled bet exceeds max bet limit");

                require(chipToken.transferFrom(msg.sender, address(this), additionalBet), "Token transfer failed");
                pb.betAmount += additionalBet;
                pb.doubledDown = true;

                pb.cards.push(newCard);
                pb.score = calculateScore(pb.cards);

                if (pb.score > 21) {
                    pb.busted = true;
                    emit PlayerAction(tableId, msg.sender, "double_bust_left", pb.cards, pb.score);
                } else {
                    pb.stood = true;
                    emit PlayerAction(tableId, msg.sender, "double_stand_left", pb.cards, pb.score);
                }
                pb.activeHandIndex = 1; // Transition to right hand
            } else {
                require(!pb.splitStood && !pb.splitBusted, "Right hand turn already completed");
                require(pb.splitCards.length == 2, "Can only double down on initial 2 cards");
                uint256 additionalBet = pb.splitBetAmount;
                require(pb.splitBetAmount * 2 <= maxBet, "Doubled bet exceeds max bet limit");

                require(chipToken.transferFrom(msg.sender, address(this), additionalBet), "Token transfer failed");
                pb.splitBetAmount += additionalBet;

                pb.splitCards.push(newCard);
                pb.splitScore = calculateScore(pb.splitCards);

                if (pb.splitScore > 21) {
                    pb.splitBusted = true;
                    emit PlayerAction(tableId, msg.sender, "double_bust_right", pb.splitCards, pb.splitScore);
                } else {
                    pb.splitStood = true;
                    emit PlayerAction(tableId, msg.sender, "double_stand_right", pb.splitCards, pb.splitScore);
                }
                advanceTurn(tableId);
            }
        } else {
            require(!pb.stood && !pb.busted, "Turn already completed");
            require(pb.cards.length == 2, "Can only double down on initial 2 cards");
            uint256 additionalBet = pb.betAmount;
            require(pb.betAmount * 2 <= maxBet, "Doubled bet exceeds max bet limit");

            require(chipToken.transferFrom(msg.sender, address(this), additionalBet), "Token transfer failed");
            pb.betAmount += additionalBet;
            pb.doubledDown = true;

            pb.cards.push(newCard);
            pb.score = calculateScore(pb.cards);

            if (pb.score > 21) {
                pb.busted = true;
                emit PlayerAction(tableId, msg.sender, "double_bust", pb.cards, pb.score);
            } else {
                pb.stood = true;
                emit PlayerAction(tableId, msg.sender, "double_stand", pb.cards, pb.score);
            }
            advanceTurn(tableId);
        }
    }

    /**
     * @dev Stand for the active hand of the active turn player.
     */
    function stand(uint256 tableId) external {
        Table storage t = tables[tableId];
        require(t.state == TableState.Playing, "Game round is not active");
        address activePlayer = t.activePlayers[t.currentTurnIndex];
        require(msg.sender == activePlayer, "Not your turn");
        PlayerBet storage pb = t.bets[msg.sender];

        t.lastActionTimestamp = block.timestamp;

        if (pb.isSplit) {
            if (pb.activeHandIndex == 0) {
                require(!pb.stood && !pb.busted, "Left hand turn already completed");
                pb.stood = true;
                pb.activeHandIndex = 1; // Move to right hand
                emit PlayerAction(tableId, msg.sender, "stand_left", pb.cards, pb.score);
            } else {
                require(!pb.splitStood && !pb.splitBusted, "Right hand turn already completed");
                pb.splitStood = true;
                emit PlayerAction(tableId, msg.sender, "stand_right", pb.splitCards, pb.splitScore);
                advanceTurn(tableId);
            }
        } else {
            require(!pb.stood && !pb.busted, "Turn already completed");
            pb.stood = true;
            emit PlayerAction(tableId, msg.sender, "stand", pb.cards, pb.score);
            advanceTurn(tableId);
        }
    }

    /**
     * @dev Native on-chain Split mechanism. Splits 2 equal-rank cards into 2 playable hands.
     */
    function split(uint256 tableId) external nonReentrant {
        Table storage t = tables[tableId];
        require(t.state == TableState.Playing, "Game round is not active");
        address activePlayer = t.activePlayers[t.currentTurnIndex];
        require(msg.sender == activePlayer, "Not your turn");
        PlayerBet storage pb = t.bets[msg.sender];
        require(!pb.stood && !pb.busted, "Turn already completed");
        require(!pb.isSplit, "Already split");
        require(pb.cards.length == 2, "Can only split on initial 2 cards");
        require(
            pb.cards[0] % 13 == pb.cards[1] % 13,
            "Cards must be of same rank to split"
        );
       
        uint256 additionalBet = pb.betAmount;
        require(pb.betAmount * 2 <= maxBet, "Split bet exceeds max bet limit");

        // Pull additional matching bet amount for the split hand
        require(chipToken.transferFrom(msg.sender, address(this), additionalBet), "Token transfer failed");
       
        pb.isSplit = true;
        pb.splitBetAmount = additionalBet;
        pb.activeHandIndex = 0;
       
        // Move the second card to the split hand
        uint8 secondCard = pb.cards[1];
        pb.cards.pop();
        pb.splitCards.push(secondCard);
       
        // Deal 1 card to the first hand and 1 card to the second hand
        bytes32 seed = keccak256(abi.encodePacked(block.timestamp, msg.sender, tableId, "split"));
        pb.cards.push(getRandomCard(seed, 1));
        pb.score = calculateScore(pb.cards);

        pb.splitCards.push(getRandomCard(seed, 2));
        pb.splitScore = calculateScore(pb.splitCards);
       
        t.lastActionTimestamp = block.timestamp;
       
        // Emit events
        emit PlayerAction(tableId, msg.sender, "split", pb.cards, pb.score);
    }

    /**
     * @dev Public protection function to skip or force-stand players who are inactive (timed out).
     */
    function forceTimeout(uint256 tableId) external {
        Table storage t = tables[tableId];
        require(t.state == TableState.Playing, "Table is not in playing state");
        require(block.timestamp > t.lastActionTimestamp + turnTimeoutDuration, "Turn timeout has not expired yet");
        address activePlayer = t.activePlayers[t.currentTurnIndex];
        PlayerBet storage pb = t.bets[activePlayer];
       
        if (pb.isSplit) {
            pb.stood = true;
            pb.splitStood = true;
        } else {
            pb.stood = true;
        }
       
        emit TimeoutTriggered(tableId, activePlayer, msg.sender);
        advanceTurn(tableId);
    }

    /**
     * @dev Internal turn progression mechanism. Auto-settles if turn index exceeds active players.
     */
    function advanceTurn(uint256 tableId) internal {
        Table storage t = tables[tableId];
        t.currentTurnIndex++;
        t.lastActionTimestamp = block.timestamp;

        // Skip players who got natural blackjacks or are already stood on all hands
        while (t.currentTurnIndex < t.activePlayers.length) {
            address currentPlayer = t.activePlayers[t.currentTurnIndex];
            PlayerBet storage pb = t.bets[currentPlayer];
            bool primaryDone = pb.stood || pb.busted;
            bool splitDone = !pb.isSplit || pb.splitStood || pb.splitBusted;
           
            if (primaryDone && splitDone) {
                t.currentTurnIndex++;
            } else {
                break;
            }
        }

        // If turn has moved past the last active player, transition to settle dealer hand
        if (t.currentTurnIndex >= t.activePlayers.length) {
            t.state = TableState.Settling;
            _settleTable(tableId);
        }
    }

    /**
     * @dev External/public wrapper for settling the table, wrapped in a nonReentrant modifier.
     */
    function settleTable(uint256 tableId) external nonReentrant {
        _settleTable(tableId);
    }

    /**
     * @dev Automatically advance the dealer's hand and settle payouts internally.
     */
    function _settleTable(uint256 tableId) internal {
        Table storage t = tables[tableId];
        require(t.state == TableState.Settling, "Table is not in settling state");

        bytes32 seed = keccak256(abi.encodePacked(block.timestamp, block.prevrandao, tableId, "settle"));
        uint256 nonce = 0;

        // Reveal dealer's face-down card (the 2nd card was dealt as 0)
        t.dealerCards[1] = getRandomCard(seed, nonce++);
        t.dealerScore = calculateScore(t.dealerCards);

        // Dealer must hit on soft 17 or any score below 17
        while (t.dealerScore < 17) {
            t.dealerCards.push(getRandomCard(seed, nonce++));
            t.dealerScore = calculateScore(t.dealerCards);
        }

        // Distribute payouts to each player
        for (uint256 i = 0; i < t.activePlayers.length; i++) {
            address player = t.activePlayers[i];
            PlayerBet storage pb = t.bets[player];
            if (pb.settled) continue;

            uint256 payout = 0;

            // --- Evaluate primary hand ---
            if (!pb.busted) {
                if (t.dealerScore > 21) {
                    payout += pb.betAmount * 2;
                } else if (pb.score > t.dealerScore) {
                    payout += pb.betAmount * 2;
                } else if (pb.score == t.dealerScore) {
                    payout += pb.betAmount;
                }
            }

            // Natural blackjack bonus: payout 3:2 (2.5x original bet).
            // Natural blackjack cannot happen if hand has split or was doubled down.
            if (!pb.isSplit && !pb.busted && pb.score == 21 && pb.cards.length == 2 && t.dealerScore != 21) {
                payout = (pb.betAmount * 5) / 2; // 2.5x original bet (bet + 1.5x profit)
            }

            // --- Evaluate split hand ---
            if (pb.isSplit && !pb.splitBusted) {
                if (t.dealerScore > 21) {
                    payout += pb.splitBetAmount * 2;
                } else if (pb.splitScore > t.dealerScore) {
                    payout += pb.splitBetAmount * 2;
                } else if (pb.splitScore == t.dealerScore) {
                    payout += pb.splitBetAmount;
                }
            }

            pb.settled = true;
            if (payout > 0) {
                require(chipToken.transfer(player, payout), "Payout transfer failed");
            }
        }

        t.state = TableState.Finished;
        emit TableSettled(tableId, t.dealerCards, t.dealerScore);
    }

    /**
     * @dev Pseudorandom card generator mapping value between 1 and 13.
     */
    function getRandomCard(bytes32 seed, uint256 nonce) internal pure returns (uint8) {
        uint256 rand = uint256(keccak256(abi.encode(seed, nonce))) % 13 + 1;
        // Face cards (Jack, Queen, King) are 11, 12, 13
        return uint8(rand);
    }

    /**
     * @dev Computes optimal Blackjack score handling soft/hard Aces.
     */
    function calculateScore(uint8[] memory cards) public pure returns (uint8) {
        uint8 score = 0;
        uint8 aces = 0;

        for (uint256 i = 0; i < cards.length; i++) {
            uint8 val = cards[i];
            if (val == 0) continue; // Face-down card is treated as 0 value
           
            if (val > 10) {
                score += 10; // Jack, Queen, King are valued at 10
            } else if (val == 1) {
                aces++;
                score += 11; // Assume Ace is 11 initially
            } else {
                score += val;
            }
        }

        // Adjust for soft/hard aces if we busted
        while (score > 21 && aces > 0) {
            score -= 10;
            aces--;
        }

        return score;
    }

    /**
     * @dev Checks if all seated players have finished their turns.
     */
    function allPlayersFinished(uint256 tableId) public view returns (bool) {
        Table storage t = tables[tableId];
        for (uint256 i = 0; i < t.activePlayers.length; i++) {
            PlayerBet storage pb = t.bets[t.activePlayers[i]];
            bool primaryDone = pb.stood || pb.busted;
            bool splitDone = !pb.isSplit || pb.splitStood || pb.splitBusted;
            if (!primaryDone || !splitDone) {
                return false;
            }
        }
        return true;
    }

    function getActivePlayers(uint256 tableId) external view returns (address[] memory) {
        return tables[tableId].activePlayers;
    }

    function getPlayerBetDetails(uint256 tableId, address player) external view returns (
        address playerAddress,
        uint256 betAmount,
        uint8[] memory cards,
        uint8 score,
        bool stood,
        bool busted,
        bool settled,
        bool doubledDown
    ) {
        PlayerBet storage pb = tables[tableId].bets[player];
        return (
            pb.player,
            pb.betAmount,
            pb.cards,
            pb.score,
            pb.stood,
            pb.busted,
            pb.settled,
            pb.doubledDown
        );
    }

    // Split-related getter separated to avoid "stack too deep"
    function getPlayerSplitDetails(uint256 tableId, address player) external view returns (
        bool isSplit,
        uint8[] memory splitCards,
        uint8 splitScore,
        bool splitStood,
        bool splitBusted,
        uint256 splitBetAmount,
        uint8 activeHandIndex
    ) {
        PlayerBet storage pb = tables[tableId].bets[player];
        return (
            pb.isSplit,
            pb.splitCards,
            pb.splitScore,
            pb.splitStood,
            pb.splitBusted,
            pb.splitBetAmount,
            pb.activeHandIndex
        );
    }


    // --- Getters ---
    function getDealerCards(uint256 tableId) external view returns (uint8[] memory) {
        return tables[tableId].dealerCards;
    }

    // --- Admin Controls ---
    /**
     * @dev Set configuration limits for the casino bets and action timers.
     */
    function setGameRules(uint256 _minBet, uint256 _maxBet, uint256 _turnTimeoutDuration) external onlyOwner {
        require(_minBet > 0, "Min bet must be > 0");
        require(_maxBet >= _minBet, "Max bet must be >= Min bet");
        require(_turnTimeoutDuration >= 10, "Timeout must be >= 10s");
        minBet = _minBet;
        maxBet = _maxBet;
        turnTimeoutDuration = _turnTimeoutDuration;
        emit RulesUpdated(_minBet, _maxBet, _turnTimeoutDuration);
    }

    /**
     * @dev Allows the owner to withdraw mistakenly sent ERC20 tokens or retrieve excessive casino chip profits.
     */
    function withdrawTokens(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(IERC20(token).transfer(owner, amount), "Token withdrawal failed");
        emit TokensWithdrawn(token, amount);
    }

    /**
     * @dev Transfer ownership of the contract.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner is zero address");
        owner = newOwner;
    }
}
