import React from "react";
type Marker = {
    id: string;
    lngLat: [number, number];
    color?: string;
    title?: string;
};
type Props = {
    accessToken?: string;
    center?: [number, number];
    zoom?: number;
    markers?: Marker[];
    route?: [number, number][];
    mapStyle?: string;
    style?: React.CSSProperties;
    children?: React.ReactNode;
};
export default function MapPlaceholder({ accessToken, center, zoom, markers, route, mapStyle, style, children, }: Props): import("react/jsx-runtime").JSX.Element;
export {};
