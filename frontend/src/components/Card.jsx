import React from 'react';

const suits = ['♠', '♥', '♦', '♣'];
const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const Card = ({ cardId, hidden }) => {
  if (hidden) {
    return (
      <div className="playing-card bg-blue-800 border-2 border-blue-400" style={{ background: 'repeating-linear-gradient(45deg, #1e3a8a, #1e3a8a 10px, #1e40af 10px, #1e40af 20px)' }}>
      </div>
    );
  }

  // Contract generates random 1-13 for card value, assuming we map it back or just use visual representation
  // Since cardId from contract is random (1-13), we'll derive a random suit based on it for visual purposes,
  // or actually, contract generates 1-13 as card value, but doesn't store suit.
  // We'll use cardId to determine value and derive a pseudo-random suit.
  const valueIndex = (cardId - 1) % 13;
  const suitIndex = cardId % 4;
  
  const value = values[valueIndex];
  const suit = suits[suitIndex];
  const isRed = suit === '♥' || suit === '♦';

  return (
    <div className={`playing-card ${isRed ? 'card-red' : ''}`}>
      <div className="card-suit">{value}{suit}</div>
      <div className="text-4xl">{suit}</div>
      <div className="card-suit-bottom">{value}{suit}</div>
    </div>
  );
};
