/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string; // CSS color string (e.g. hex)
}

interface LeafletMapProps {
  center: [number, number];
  zoom: number;
  markers: MapMarker[];
  onMarkerClick?: (markerId: string) => void;
  height?: string;
}

export const LeafletMap: React.FC<LeafletMapProps> = ({
  center,
  zoom,
  markers,
  onMarkerClick,
  height = "320px",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clean up existing map instance if any (precautionary)
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    // Initialize map
    const map = L.map(containerRef.current, {
      center: center,
      zoom: zoom,
      zoomControl: true,
      fadeAnimation: true,
    });

    mapRef.current = map;

    // Add standard OpenStreetMap Tile Layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    // Dynamic marker layer group
    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;

    // Trigger map invalidation after slight delay to fix container sizing bugs inside relative layouts
    const resizeTimeout = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(resizeTimeout);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update center and zoom dynamically
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView(center, zoom);
    }
  }, [center, zoom]);

  // Sync and plot markers dynamically
  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current) return;

    // Clear previous markers
    markersLayerRef.current.clearLayers();

    markers.forEach((m) => {
      const color = m.badgeColor || '#14387F'; // Default gov blue

      // Custom HTML Marker using L.divIcon to avoid broken Vite image import URLs
      const svgIcon = L.divIcon({
        className: 'custom-leaflet-marker-wrapper',
        html: `
          <div class="relative flex items-center justify-center" style="width: 24px; height: 24px;">
            <div class="absolute w-6 h-6 rounded-full opacity-35 animate-ping" style="background-color: ${color};"></div>
            <div class="absolute w-4.5 h-4.5 rounded-full border-2 border-white flex items-center justify-center font-mono text-[9px] font-black text-white shadow-lg cursor-pointer transform hover:scale-130 transition-transform" style="background-color: ${color};" title="${m.title}">
              ◉
            </div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([m.lat, m.lng], { icon: svgIcon })
        .addTo(markersLayerRef.current!)
        .bindPopup(`
          <div style="font-family: 'Noto Sans', sans-serif; font-size: 12px; color: #1a1a1a; text-align: left; padding: 4px; line-height: 1.4;">
            <strong style="color: #0b2e5e; display: block; font-size: 13px; margin-bottom: 2px;">${m.title}</strong>
            ${m.subtitle ? `<span style="color: #5a6577; display: block; margin-bottom: 6px;">${m.subtitle}</span>` : ''}
            ${m.badge ? `<span style="display: inline-block; background-color: ${color}15; color: ${color}; font-size: 9px; font-weight: 500; border: 1px solid ${color}35; border-radius: 4px; padding: 1px 6px; text-transform: uppercase; font-family: monospace;">${m.badge}</span>` : ''}
          </div>
        `);

      if (onMarkerClick) {
        marker.on('click', () => {
          onMarkerClick(m.id);
        });
      }
    });

  }, [markers, onMarkerClick]);

  return (
    <div 
      className="w-full relative rounded-xl overflow-hidden border border-slate-200 shadow-inner"
      style={{ height }}
    >
      <div ref={containerRef} className="w-full h-full" id={`leaflet-map-div-${center[0].toFixed(2)}`} />
    </div>
  );
};
