import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { GeoLocation, RideNode } from '@movi/types';

let socket: any;

export default function Home() {
  const [messages, setMessages] = useState<string[]>([]);
  useEffect(() => {
    socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000', {
      path: '/socket.io'
    });

    socket.on('connect', () => setMessages(prev => [...prev, `connected ${socket.id}`]));
    socket.on('ride:tracking', (loc: GeoLocation) => {
      setMessages(prev => [...prev, `tracking: ${loc.lat},${loc.lng}`]);
    });
    socket.on('ride:assigned', (data: any) => {
      setMessages(prev => [...prev, `assigned ride ${data.ride.id}`]);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const requestRide = async () => {
    // emit passenger request (via namespace)
    const passengerNs = io(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/passengers`);
    passengerNs.emit('passenger:request_ride', {
      passengerId: 'demo-passenger',
      origin: { lat: -25.3, lng: -57.6 },
      destination: { lat: -25.28, lng: -57.63 }
    });
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>MOVI</h1>
      <button onClick={requestRide}>Request Ride (demo)</button>
      <div style={{ marginTop: 20 }}>
        <h3>Events</h3>
        <ul>
          {messages.map((m, i) => <li key={i}>{m}</li>)}
        </ul>
      </div>
    </div>
  );
}
