declare module 'mapbox-gl' {
  export * from 'mapbox-gl';
}

declare module 'mapbox-gl/dist/mapbox-gl.css' {
  const content: any;
  export = content;
}
