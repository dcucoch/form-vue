import React, { useState, useRef, useEffect } from 'react';
import { GoogleMap, LoadScript, Marker } from '@react-google-maps/api';


const mapContainerStyle = {
  height: '400px',
  width: '100%',
  borderRadius: '8px',
  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
};

const center = {
  lat: -33.4485,
  lng: -70.7256, // Centro aproximado de Lo Prado, Santiago
};

const mapOptions = {
  disableDefaultUI: true, // Optional: Disables all default controls
  mapTypeControl: false, // Disables the map type control
  zoomControl: true,
  fullscreenControl: true,
};

const TerritoryChecker = ({ address, onTerritoryFound }) => {
  const [location, setLocation] = useState(null);
  const [isInTerritory, setIsInTerritory] = useState('');
  const mapRef = useRef();
  const polygons = useRef([]);
  const kmlUrl = 'kml/jvmapa.kml'; // Replace with the actual URL to your KML file

  useEffect(() => {
    if (location) {
      const territoryName = checkIfInTerritory(location);
      setIsInTerritory(territoryName);
      onTerritoryFound(territoryName); // Pass the territory name to the parent component
    }
  }, [location]);

  const handleCheckTerritory = () => {
    const geocoder = new window.google.maps.Geocoder();
    console.error('Address to geocode:', address);

    geocoder.geocode({
      address: address,
      componentRestrictions: {
        country: 'CL'  // Especifica el país (Chile en este caso)
      }
    }, (results, status) => {
      if (status === 'OK') {
        if (results.length > 0) {
          const bestResult = results[0];
          console.log('Geocoding results:', bestResult);
          setLocation(bestResult.geometry.location);
        } else {
          console.error('No geocoding results found for the given address');
        }
      } else {
        console.error('Geocode was not successful for the following reason:', status);
      }
    });
  };


  const checkIfInTerritory = (location) => {
    if (!mapRef.current || !window.google || !window.google.maps || !window.google.maps.geometry) return false;
    let isInTerritory = false;
    let name = "";
    polygons.current.forEach((p) => {
      const point = new window.google.maps.LatLng(location.lat(), location.lng());
      if (
        window.google.maps.geometry.poly.containsLocation(point, p.polygon) ||
        window.google.maps.geometry.poly.isLocationOnEdge(point, p.polygon)
      ) {
        // Set green polygon styles (optional)
        p.polygon.setOptions({ strokeColor: '#00FF00', fillColor: '#00FF00', strokeOpacity: 0.8, fillOpacity: 0.35 });
        name = p.name;
        isInTerritory = true;

        // Update map center and zoom
        mapRef.current.setCenter(location);
        mapRef.current.setZoom(17); // Replace with your desired maximum zoom level
      } else {
        p.polygon.setOptions({ fillColor: '#0000FF', strokeOpacity: 0, fillOpacity: 0 });
      }
    });

    return name;
  };

  const clearMap = () => {
    setLocation(null);
    setIsInTerritory('');
  };

  const onLoad = async (map) => {
    mapRef.current = map;

    try {
      const response = await fetch(kmlUrl);
      const kmlText = await response.text();
      const parser = new window.DOMParser();
      const kmlDoc = parser.parseFromString(kmlText, 'text/xml');
      const placemarks = kmlDoc.getElementsByTagName('Placemark');

      Array.from(placemarks).forEach((placemark) => {
        const name = placemark.getElementsByTagName('name')[0].textContent.trim();
        const coordinatesText = placemark.getElementsByTagName('coordinates')[0].textContent.trim();
        const coordinatesArray = coordinatesText
          .split(' ')
          .map((coord) => {
            const [lng, lat] = coord.split(',').map(Number);
            if (isNaN(lat) || isNaN(lng)) {
              console.error('Invalid coordinates:', coord);
              return null;
            }
            return { lat, lng };
          })
          .filter((coord) => coord !== null);

        const polygon = new window.google.maps.Polygon({
          paths: coordinatesArray,
          strokeColor: '#0000FF',
          strokeOpacity: 0,
          strokeWeight: 2,
          fillColor: '#0000FF',
          fillOpacity: 0,
          map: map,
        });

        // Add the polygon and its name to the object
        polygons.current.push({
          name: name,
          polygon: polygon,
        });
      });
    } catch (error) {
      console.error('Error loading KML file:', error);
    }
    handleCheckTerritory();
  };

  return (
    <LoadScript googleMapsApiKey={process.env.REACT_APP_GOOGLE_MAPS_API_KEY}>
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={14}
        options={mapOptions}
        onLoad={onLoad}
      >
        {location && (
          <Marker
            position={location}
          />
        )}
      </GoogleMap>
    </LoadScript>
  );
};

export default TerritoryChecker;
