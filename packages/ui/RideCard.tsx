import React from "react";
export default function RideCard({
  id, origin, destination, onAccept, onCancel, small
}: {
  id?: string;
  origin: { lat:number; lng:number };
  destination: { lat:number; lng:number };
  onAccept?: ()=>void;
  onCancel?: ()=>void;
  small?: boolean;
}){
  return (
    <div className="card" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <div style={{fontWeight:700}}>Ride {id ?? ""}</div>
        <div style={{color:"var(--muted)",fontSize:13}}>
          From: {origin.lat.toFixed(3)},{origin.lng.toFixed(3)} → To: {destination.lat.toFixed(3)},{destination.lng.toFixed(3)}
        </div>
      </div>
      <div style={{display:"flex",gap:8}}>
        {onAccept && <button className="btn" onClick={onAccept}>Aceptar</button>}
        {onCancel && <button className="small-btn" onClick={onCancel}>Cancelar</button>}
      </div>
    </div>
  );
}