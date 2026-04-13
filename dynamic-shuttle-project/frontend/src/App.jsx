import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { socket } from './socket';
import { BusFront, Users, MapPin } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';

// -------------------------------------------------------------
// Sleek Uber-Like Shuttle Icon
// -------------------------------------------------------------
const shuttleIconMarkup = renderToStaticMarkup(
  <div className="relative flex items-center justify-center w-12 h-12 drop-shadow-xl">
    <div className="absolute inset-0 bg-blue-500 rounded-full opacity-20 animate-ping"></div>
    <div className="relative z-10 flex flex-col items-center justify-center bg-black border-[3px] border-white rounded-full shadow-md p-1.5 w-10 h-10">
      <BusFront color="white" size={18} />
    </div>
  </div>
);

const customShuttleIcon = L.divIcon({
  html: shuttleIconMarkup,
  className: '',
  iconSize: [48, 48],
  iconAnchor: [24, 24],
});

// -------------------------------------------------------------
// Minimalist Station Dot Icon
// -------------------------------------------------------------
const stationMarkup = renderToStaticMarkup(
  <div className="flex flex-col items-center drop-shadow-md">
    <div className="bg-black rounded-full flex items-center justify-center w-6 h-6 border-2 border-white">
      <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
    </div>
  </div>
);

const stationIcon = L.divIcon({
  html: stationMarkup,
  className: '', 
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

// Manyata Tech Park Stations Array
const STATIONS = [
  { id: 'gate', name: 'Main Gate (Entry)', lat: 13.0440, lng: 77.6190 },
  { id: 'food_court', name: 'Food Court (Block E)', lat: 13.0470, lng: 77.6210 },
  { id: 'blocks_g_h', name: 'Blocks G & H', lat: 13.0465, lng: 77.6240 },
  { id: 'blocks_k_l', name: 'Blocks K & L', lat: 13.0485, lng: 77.6235 },
  { id: 'admin', name: 'Admin Block', lat: 13.0495, lng: 77.6215 }
];

function AppLayout() {
  const campusCenter = [13.0475, 77.6200];
  const location = useLocation();
  const [vehiclePos, setVehiclePos] = useState(campusCenter);
  const [isConnected, setIsConnected] = useState(false);
  const [pickupRequested, setPickupRequested] = useState(null);
  const [rideState, setRideState] = useState('IDLE'); // IDLE, WAITING, ARRIVED, TRANSIT, MISSED
  const [etaInfo, setEtaInfo] = useState(null);
  const [pickupStation, setPickupStation] = useState(null);
  const [dropoffStation, setDropoffStation] = useState(null);
  
  // Multi-Shuttle States
  const [activeShuttles, setActiveShuttles] = useState([]); // Array of shuttle objects
  const [shuttlePaths, setShuttlePaths] = useState([]); // Array of {id, path} objects
  const [driverQueues, setDriverQueues] = useState([]); // Array of {id, queue} objects

  useEffect(() => {
    socket.connect();

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    
    socket.on('shuttles_update', (payload) => {
      setActiveShuttles(payload);
      
      // Tick down ETA locally each time the shuttle updates (every 1.5s)
      setEtaInfo(prev => {
        if (!prev) return null;
        const newEta = prev.etaSeconds - 1.5;
        return { ...prev, etaSeconds: newEta > 0 ? newEta : 0 };
      });
    });
    
    socket.on('route_path', (payload) => {
      setShuttlePaths(payload);
    });
    
    socket.on('pickup_assigned', (data) => {
      setEtaInfo(data);
    });
    
    socket.on('queue_update', (payload) => {
      setDriverQueues(payload);
    });

    socket.on('shuttle_arrived', () => {
      setRideState('ARRIVED');
    });

    socket.on('shuttle_missed', () => {
      setRideState('MISSED');
      setEtaInfo(null);
    });

    socket.on('passenger_dropped_off', () => {
      setRideState('IDLE');
      setPickupRequested(null);
      setEtaInfo(null);
      setPickupStation(null);
      setDropoffStation(null);
      alert('You have arrived at your destination!');
    });
    
    socket.on('passenger_boarded', (stationId) => {
      setPickupRequested((prev) => {
        if (prev === stationId) {
          setRideState('TRANSIT');
          setEtaInfo(null);
          return prev; 
        }
        return prev;
      });
    });

    socket.on('request_rejected', (msg) => {
      alert("⚠️ " + msg);
      setPickupRequested(null); // Reset their button so they can try again
      setRideState('IDLE');
      setEtaInfo(null);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('shuttles_update');
      socket.off('route_path');
      socket.off('queue_update');
      socket.off('pickup_assigned');
      socket.off('shuttle_arrived');
      socket.off('shuttle_missed');
      socket.off('passenger_dropped_off');
      socket.off('passenger_boarded');
      socket.off('request_rejected');
      socket.disconnect();
    };
  }, []);

  const handleRequestPickup = () => {
    if (!pickupStation || !dropoffStation) return;
    if (pickupStation.id === dropoffStation.id) {
      alert("Pickup and Dropoff locations cannot be the same!");
      return;
    }
    
    socket.emit('request_pickup', { 
      stationId: pickupStation.id, 
      lat: pickupStation.lat, 
      lng: pickupStation.lng,
      dropoffId: dropoffStation.id,
      dropoffLat: dropoffStation.lat,
      dropoffLng: dropoffStation.lng
    });
    setPickupRequested(pickupStation.id);
    setRideState('WAITING');
  };

  return (
    <div className="h-screen w-screen relative bg-slate-50 text-slate-800 font-sans overflow-hidden">
      
      {/* Sleek Floating Navigation Segment Control */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[2000] bg-white rounded-full p-1.5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex gap-1 border border-slate-100">
          <Link 
            to="/"
            className={`px-6 py-2 rounded-full text-sm font-bold tracking-tight transition-all duration-300 ${(location.pathname === '/' || location.pathname === '/employee') ? 'bg-black text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            Rider
          </Link>
          <Link 
            to="/driver"
            className={`px-6 py-2 rounded-full text-sm font-bold tracking-tight transition-all duration-300 ${(location.pathname === '/driver') ? 'bg-black text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            Driver
          </Link>
          <Link 
            to="/mentor"
            className={`px-6 py-2 rounded-full text-sm font-bold tracking-tight transition-all duration-300 ${(location.pathname === '/mentor') ? 'bg-black text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            Simulator
          </Link>
          
          {/* Connection Dot */}
          <div className="flex items-center ml-2 mr-3">
             <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} title={isConnected ? "Server Connected" : "Disconnected"}></span>
          </div>
      </div>
      
      <div className="h-full w-full relative">
        
        {/* React Router SPA Page Overlays */}
        <Routes>
          
          {/* DRIVER ROUTE: Uber-Style Full Dashboard */}
          <Route path="/driver" element={
          <div className="absolute top-24 left-6 z-[1000] w-[340px] max-h-[80%] flex flex-col pointer-events-none drop-shadow-2xl">
            <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex flex-col h-full pointer-events-auto border border-slate-100 overflow-hidden">
              <div className="bg-black p-5 text-white flex justify-between items-center">
                <h2 className="text-xl font-bold tracking-tight">Active Queue</h2>
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur">
                  <BusFront size={20} />
                </div>
              </div>
            
            <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-50/50">
              {driverQueues.every(s => s.queue.length === 0) ? (
                <div className="text-center text-slate-400 py-10 text-sm font-medium">Looking for passengers...</div>
              ) : (
                driverQueues.map((shuttleGroup) => (
                  <div key={shuttleGroup.id} className="space-y-3 mb-6">
                    {shuttleGroup.queue.length > 0 && <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{shuttleGroup.id} Next Stops</div>}
                    {shuttleGroup.queue.map((q) => {
                      const shuttleStatus = activeShuttles.find(s => s.id === shuttleGroup.id);
                      const isWaitingHere = shuttleStatus?.waitingForStation === q.stationId;
                      
                      return (
                      <div key={q.stationId} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3 mb-3">
                           <div className={`w-2 h-2 shrink-0 self-center rounded-full ${isWaitingHere ? 'bg-orange-500 animate-ping' : 'bg-black'}`}></div>
                           <span className="font-bold text-slate-800 text-[13px] flex-1 whitespace-pre-wrap leading-tight">{q.name}</span>
                        </div>
                        <button 
                          onClick={() => socket.emit('clear_passenger', {shuttleId: shuttleGroup.id, stationId: q.stationId})}
                          disabled={!isWaitingHere}
                          className={`w-full py-3 rounded-xl font-bold text-sm transition-colors ${isWaitingHere ? 'bg-black text-white hover:bg-slate-800 shadow-md' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                        >
                          {isWaitingHere ? 'Confirm Boarded' : 'En Route...'}
                        </button>
                      </div>
                    )})}
                  </div>
                ))
              )}
            </div>
          </div>
          </div>
          } />

          {/* MENTOR ROUTE */}
          <Route path="/mentor" element={
          <div className="absolute top-24 left-6 z-[1000] w-[340px] max-h-[80%] flex flex-col pointer-events-none drop-shadow-2xl">
            <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex flex-col h-full pointer-events-auto border border-slate-100 overflow-hidden">
            <div className="bg-amber-500 p-5 text-white flex justify-between items-center">
              <h2 className="text-xl font-bold tracking-tight">AI Telemetry</h2>
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur">
                <MapPin size={20} />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-50/50">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <span className="font-bold text-emerald-600 text-[15px]">✓ Real Routing Active</span>
                <p className="text-xs text-slate-500 mt-1">
                  The artificial simulator flags have been successfully removed.
                  <br/><br/>
                  The backend AI now dynamically filters shuttles using true mathematical thresholds:<br/>
                  <br/>
                  <b>• Capacity:</b> Reject if Load &gt; 10<br/>
                  <b>• Detour:</b> Reject if Added Wait &gt; 600s
                </p>
              </div>
            </div>
          </div>
          </div>
          } />
          
          <Route path="/" element={
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-sm z-[1000] px-4 pointer-events-none">
              <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] p-6 pointer-events-auto border border-slate-100 flex flex-col gap-4">
                 <div>
                   <h2 className="text-2xl font-bold tracking-tight text-slate-800">Where to?</h2>
                   <p className="text-sm text-slate-500 mt-1">Tap any map marker to hail a shuttle.</p>
                 </div>
                 
                 <div className="bg-slate-100/80 rounded-2xl p-4 flex flex-col gap-3">
                   <div className="flex items-center gap-3">
                     <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                     <span className="text-sm font-bold text-slate-700 w-full truncate">{pickupStation ? pickupStation.name : "Select Pickup on map"}</span>
                   </div>
                   <div className="mx-1 h-3 border-l-2 border-slate-300 border-dashed"></div>
                   <div className="flex items-center gap-3">
                     <div className="w-2.5 h-2.5 rounded bg-black"></div>
                     <span className="text-sm font-bold text-slate-700 w-full truncate">{dropoffStation ? dropoffStation.name : "Select Dropoff on map"}</span>
                   </div>
                 </div>
                 
                 {rideState === 'IDLE' && pickupStation && dropoffStation && (
                   <button 
                     onClick={handleRequestPickup}
                     className="w-full py-3 mt-2 bg-black hover:bg-slate-800 text-white rounded-xl font-bold transition-colors shadow-lg"
                   >
                     Confirm Shuttle Request
                   </button>
                 )}

                 {rideState === 'WAITING' && (
                    <div className="w-full mt-3 text-center">
                      <div className="text-sm font-bold text-blue-600 bg-blue-50 py-2 rounded-xl border border-blue-100">
                        {etaInfo ? `${etaInfo.shuttleId} arriving in ~${Math.ceil(etaInfo.etaSeconds / 60)} min` : "Request Sent! Assigning Route..."}
                      </div>
                      <div className="w-full mt-3 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="w-full h-full bg-blue-500 animate-pulse origin-left"></div>
                      </div>
                    </div>
                 )}

                 {rideState === 'ARRIVED' && (
                    <div className="w-full mt-3 text-center">
                      <div className="text-sm font-bold text-orange-600 bg-orange-50 py-3 rounded-xl border border-orange-200 animate-pulse">
                        ⚠️ SHUTTLE HAS ARRIVED!<br/>Please board and wait for Driver config.
                      </div>
                    </div>
                 )}

                 {rideState === 'TRANSIT' && (
                    <div className="w-full mt-3 text-center">
                      <div className="text-sm font-bold text-emerald-600 bg-emerald-50 py-3 rounded-xl border border-emerald-200">
                        🚐 En Route to Destination
                      </div>
                    </div>
                 )}

                 {rideState === 'MISSED' && (
                    <div className="w-full mt-3 text-center">
                      <div className="text-sm font-bold text-red-600 bg-red-50 py-3 rounded-xl border border-red-200 mb-2">
                        ❌ You missed your shuttle! It left the station.
                      </div>
                      <button 
                        onClick={() => { setRideState('IDLE'); setPickupRequested(null); }}
                        className="w-full py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-bold transition-colors"
                      >
                        Reset and Try Again
                      </button>
                    </div>
                 )}

              </div>
            </div>
          } />
          
          <Route path="*" element={<div/>} />
        </Routes>

        {/* Shared Base Maps layer preserved across URLs for performance */}
        <MapContainer 
          center={campusCenter} 
          zoom={16} 
          minZoom={15} // Prevent zooming out to the city
          maxBounds={[
            [13.0380, 77.6130], // South-West boundary limit
            [13.0550, 77.6300]  // North-East boundary limit
          ]}
          maxBoundsViscosity={1.0} // Act as a solid wall preventing panning
          style={{ height: '100%', width: '100%', position: 'absolute', inset: 0, zIndex: 0 }}
        >
          {/* Authentic Google Maps Styling for vibrant colors */}
          <TileLayer
            attribution='&copy; Google Maps'
            url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
          />
          
          {/* Render Actual OSRM Physical Polylines for ALL Shuttles */}
          {shuttlePaths.filter(s => s.path && s.path.length > 0).map((shuttleConfig, idx) => (
             <Polyline key={`path-${shuttleConfig.id}`} positions={shuttleConfig.path.map(c => [c.lat, c.lng])} color={idx === 1 ? "#10b981" : "#6366f1"} weight={4} opacity={0.7} />
          ))}
          
          {/* Render all Stations */}
          {STATIONS.map((station) => (
            <Marker key={station.id} position={[station.lat, station.lng]} icon={stationIcon}>
              <Popup className="min-w-[140px]" autoPan={false}>
                <div className="text-slate-800 font-bold mb-3 text-center">{station.name}</div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setPickupStation(station)}
                    disabled={pickupRequested === pickupStation?.id}
                    className={`flex-1 py-1.5 px-2 text-[11px] font-bold text-white rounded-lg transition-colors ${pickupStation?.id === station.id ? 'bg-green-600' : 'bg-black hover:bg-slate-800'} disabled:opacity-50`}
                  >
                    Set Pickup
                  </button>
                  <button 
                    onClick={() => setDropoffStation(station)}
                    disabled={pickupRequested === pickupStation?.id}
                    className={`flex-1 py-1.5 px-2 text-[11px] font-bold text-white rounded-lg transition-colors ${dropoffStation?.id === station.id ? 'bg-indigo-600' : 'bg-slate-500 hover:bg-slate-600'} disabled:opacity-50`}
                  >
                    Set Drop
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Render ALL Moving Shuttles */}
          {activeShuttles.map((shuttle, idx) => (
            <Marker key={shuttle.id} position={[shuttle.lat, shuttle.lng]} icon={customShuttleIcon}>
              <Popup autoPan={false}>
                <div className="text-slate-800 font-bold flex items-center justify-center gap-2 mb-2 p-1 border-b border-slate-100 text-[15px]">
                  <div className={`w-3 h-3 rounded-full ${idx === 1 ? "bg-emerald-500" : "bg-blue-500"}`}></div>
                  {shuttle.id}
                </div>
                <div className="text-sm text-slate-600 font-semibold flex items-center justify-between px-2 gap-4">
                  <span className="flex items-center gap-1"><Users size={14} className="text-slate-400"/> Rider Count</span>
                  <span className="bg-slate-100 px-2 py-1 rounded-md text-black">{shuttle.passengers}/10</span>
                </div>
              </Popup>
            </Marker>
          ))}

        </MapContainer>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
       <AppLayout />
    </BrowserRouter>
  )
}
