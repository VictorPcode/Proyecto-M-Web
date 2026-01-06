export type ID = string;

export interface GeoLocation {
  lat: number;
  lng: number;
  timestamp?: string; // ISO
  accuracy?: number;
}

/**
 * Node genérico, permite que cada tipo concreto defina su meta específico
 */
export interface Node<TMeta = Record<string, unknown>> {
  id: ID;
  path: string;
  source?: string;
  meta: TMeta;
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

// ---------------------
// Metas específicos
// ---------------------
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

export interface PassengerMeta {
  tipo: "pasajero";
  nombre: string;
  telefono?: string;
  email?: string;
  rating?: number;
}

export type RideState =
  | "pendiente"
  | "asignado"
  | "en_curso"
  | "finalizado"
  | "cancelado";

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

// ---------------------
// Nodos concretos
// ---------------------
export interface VehicleNode extends Node<VehicleMeta> {
  currentLocation?: GeoLocation;
}

export interface DriverNode extends Node<DriverMeta> {
  vehicleId?: ID;
  currentLocation?: GeoLocation;
}

export interface PassengerNode extends Node<PassengerMeta> {
  currentLocation?: GeoLocation;
}

export interface RideNode extends Node<RideMeta> {
  tracking?: GeoLocation[]; // history
}
