export default function RideCard({ id, origin, destination, onAccept, onCancel, small }: {
    id?: string;
    origin: {
        lat: number;
        lng: number;
    };
    destination: {
        lat: number;
        lng: number;
    };
    onAccept?: () => void;
    onCancel?: () => void;
    small?: boolean;
}): import("react/jsx-runtime").JSX.Element;
