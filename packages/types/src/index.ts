export type ID = string;

export interface GeoLocation {
  lat: number;
  lng: number;
  timestamp?: string; // ISO
  accuracy?: number;
}

export interface Node {
  id: ID;
  path: string;
  source?: string;
  meta: Record<string, unknown>;
  title: string;
  links: ID[];       
  backlinks: ID[];
  tasks: Task[];
}

export interface Task {
  id: ID;
  title: string;
  children?: Task[];
  status: "default" | "active" | "done" | "cancelled";
  schedule?: TaskSchedule;
  sessions?: TaskSession[];
  isInProgress: boolean;
}

export interface TaskSchedule {
  start: string; // ISO
  end?: string;
  durationMs?: number;
  isCurrent?: boolean;
}

export interface TaskSession {
  start: string;
  end?: string;
  durationMs?: number;
  isCurrent?: boolean;
}

export interface VehicleMeta {
  tipo: "vehiculo";
  placa: string;
  marca?: string;
  modelo?: string;
  color?: string;
  capacidad?: number;
  estado: "disponible" | "ocupado" | "mantenimiento";
}

export interface DriverMeta {
  tipo: "conductor";
  nombre: string;
  licencia: string;
  telefono?: string;
  rating?: number;
  estado: "offline" | "disponible" | "en_viaje";
}

export interface VehicleNode extends Node {
  meta: VehicleMeta;
  currentLocation?: GeoLocation;
}

export interface DriverNode extends Node {
  meta: DriverMeta;
  vehicleId?: ID;
  currentLocation?: GeoLocation;
}

export interface PassengerMeta {
  tipo: "pasajero";
  nombre: string;
  telefono?: string;
  email?: string;
  rating?: number;
}

export interface PassengerNode extends Node {
  meta: PassengerMeta;
  currentLocation?: GeoLocation;
}

export type RideState = "pendiente" | "asignado" | "en_curso" | "finalizado" | "cancelado";

export interface RouteSegment {
  origin: GeoLocation;
  destination: GeoLocation;
  distanceKm: number;
  estimatedTimeMin: number;
  polyline?: string;
}

export interface RideMeta {
  tipo: "viaje";
  passengerId: ID;
  driverId?: ID;
  vehicleId?: ID;
  origin: GeoLocation;
  destination: GeoLocation;
  route?: RouteSegment[];
  estimatedFare: number;
  finalFare?: number;
  distanceKm?: number;
  estimatedTimeMin?: number;
  state: RideState;
  paymentMethod?: "efectivo" | "tarjeta" | "wallet";
}

export interface RideNode extends Node {
  meta: RideMeta;
  tracking?: GeoLocation[]; // history
}
