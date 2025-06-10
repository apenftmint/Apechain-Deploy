
import React, { useState, useEffect } from 'react';

const LiveVisitorsCounter: React.FC = () => {
  // Placeholder logic - in a real app, this would connect to a backend service.
  const [visitors, setVisitors] = useState(0);

  useEffect(() => {
    // Simulate fetching visitor count
    const min = 5; // Minimum simulated visitors
    const max = 25; // Maximum simulated visitors
    setVisitors(Math.floor(Math.random() * (max - min + 1)) + min);

    const interval = setInterval(() => {
      setVisitors(prev => {
        const change = Math.random() > 0.5 ? 1 : -1;
        const newCount = prev + change;
        return Math.max(min, Math.min(max, newCount)); // Keep within simulated range
      });
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div 
        className="text-xs text-slate-400 bg-slate-700/50 px-3 py-1.5 rounded-lg shadow-md flex items-center space-x-2 backdrop-blur-sm"
        title="Simulated live visitors. Actual implementation requires a backend."
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
      </span>
      <span>{visitors} Live</span>
    </div>
  );
};

export default LiveVisitorsCounter;
