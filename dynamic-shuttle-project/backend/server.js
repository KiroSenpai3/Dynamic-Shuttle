const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI/180;
  const p2 = lat2 * Math.PI/180;
  const dp = (lat2-lat1) * Math.PI/180;
  const dl = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(dp/2) * Math.sin(dp/2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// --- Object Oriented Architecture ---
class Shuttle {
  constructor(id, startLat, startLng, loopWaypoints) {
    this.id = id;
    this.capacity = 10;
    this.passengers = 0; // Live count
    this.vehiclePos = { lat: startLat, lng: startLng };
    this.loopWaypoints = loopWaypoints;
    this.routeCoords = [];
    this.routeIndex = 0;
    this.driverQueue = [];
    this.stops = [];      // locations to pause at
    this.pauseTicks = 0;  // >0 means shuttle is stationary boarding
    this.waitingForDriver = null; // Holds the active pickup lock state
  }

  async fetchRoute(waypointsStr) {
    try {
      const response = await fetch(`http://router.project-osrm.org/route/v1/driving/${waypointsStr}?overview=full&geometries=geojson&continue_straight=false`);
      const data = await response.json();
      if (data.routes && data.routes[0]) {
        this.routeCoords = data.routes[0].geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
        console.log(`Successfully generated route constraint for ${this.id}`);
        return this.routeCoords;
      }
    } catch (err) {
      console.error(`Failed OSRM Request for ${this.id}`, err);
    }
    return [];
  }

  async fetchETA(waypointsStr) {
    try {
      const response = await fetch(`http://router.project-osrm.org/route/v1/driving/${waypointsStr}?overview=false&continue_straight=false`);
      const data = await response.json();
      if (data.routes && data.routes[0]) {
        return Math.round(data.routes[0].duration);
      }
    } catch (err) {
      console.error(`Failed OSRM Request for ETA on ${this.id}`, err);
    }
    return null;
  }
}

// Instantiate 2 distinctly different shuttles
const shuttles = [
  new Shuttle('SHUTTLE-1', 13.0440, 77.6190, `77.6190,13.0440;77.6210,13.0470;77.6240,13.0465;77.6235,13.0485;77.6215,13.0495;77.6190,13.0440`),
  new Shuttle('SHUTTLE-2', 13.0485, 77.6235, `77.6235,13.0485;77.6215,13.0495;77.6190,13.0440;77.6210,13.0470;77.6240,13.0465;77.6235,13.0485`)
];

// Generate their physical matrices upon startup
Promise.all(shuttles.map(s => s.fetchRoute(s.loopWaypoints)));

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Synchronize new users
  socket.emit('queue_update', shuttles.map(s => ({id: s.id, queue: s.driverQueue})));
  socket.emit('route_path', shuttles.map(s => ({id: s.id, path: s.routeCoords})));

  socket.on('request_pickup', async (data) => {
    
    // 1. Core Multi-Variable AI Assignment Algorithm
    let bestShuttle = null;
    let minDetourDelay = Infinity;

    for (const shuttle of shuttles) {
      // Metric 1: True Capacity Check
      // Calculate projected peak load strictly based on current load + pending pickups
      let projectedLoad = shuttle.passengers;
      for (const stop of shuttle.stops) {
        if (stop.type === 'pickup') projectedLoad++;
      }
      
      // Reject if accepting causes the active shuttle to overflow
      if (projectedLoad + 1 > shuttle.capacity) {
        console.log(`[ALGORITHM] ${shuttle.id} rejected due to Capacity limit (Projected: ${projectedLoad + 1}).`);
        continue;
      }

      // Metric 2: True OSRM Detour Delay Scoring
      const currentLoc = `${shuttle.vehiclePos.lng},${shuttle.vehiclePos.lat}`;
      const endNode = shuttle.id === 'SHUTTLE-1' ? `77.6190,13.0440` : `77.6235,13.0485`;
      
      let currentWaypoints = `${currentLoc}`;
      let lastWP = currentWaypoints;
      shuttle.stops.forEach(stop => {
        const wp = `${stop.lng},${stop.lat}`;
        if (wp !== lastWP) { currentWaypoints += `;${wp}`; lastWP = wp; }
      });
      if (lastWP !== endNode) currentWaypoints += `;${endNode}`;
      
      const currentETA = await shuttle.fetchETA(currentWaypoints) || 0;

      const pickupLoc = `${data.lng},${data.lat}`;
      const dropoffLoc = data.dropoffLng ? `${data.dropoffLng},${data.dropoffLat}` : pickupLoc;
      
      let proposedWaypoints = `${currentLoc}`;
      lastWP = proposedWaypoints;
      shuttle.stops.forEach(stop => {
        const wp = `${stop.lng},${stop.lat}`;
        if (wp !== lastWP) { proposedWaypoints += `;${wp}`; lastWP = wp; }
      });
      if (pickupLoc !== lastWP) { proposedWaypoints += `;${pickupLoc}`; lastWP = pickupLoc; }
      if (dropoffLoc !== lastWP) { proposedWaypoints += `;${dropoffLoc}`; lastWP = dropoffLoc; }
      if (lastWP !== endNode) proposedWaypoints += `;${endNode}`;

      const proposedETA = await shuttle.fetchETA(proposedWaypoints) || 0;
      const detourDelay = proposedETA - currentETA;
      
      if (detourDelay > 600) {
        console.log(`[ALGORITHM] ${shuttle.id} rejected due to Excessive Detour (${detourDelay}s).`);
        continue; 
      }

      // The shuttle proposing the absolute lowest detour delay dynamically wins the bid
      if (detourDelay < minDetourDelay) {
        minDetourDelay = detourDelay;
        bestShuttle = shuttle;
      }
    }

    if (!bestShuttle) {
      socket.emit('request_rejected', "NO SHUTTLES AVAILABLE: All active shuttles are either mostly full or would exceed the 10-minute detour limit. Please wait.");
      return;
    }

    console.log(`[ALGORITHM] Request successfully assigned to optimal agent: ${bestShuttle.id} (Detour Penalty: ${Math.round(minDetourDelay)}s)`);
    
    // 3. Queue Management
    if (!bestShuttle.driverQueue.some(q => q.stationId === data.stationId)) {
      bestShuttle.driverQueue.push({ 
        stationId: data.stationId, 
        name: `${data.stationId.replace(/_/g, ' ')} ➔ ${data.dropoffId ? data.dropoffId.replace(/_/g, ' ') : 'N/A'}`.toUpperCase(), 
        time: new Date().toLocaleTimeString() 
      });
      io.emit('queue_update', shuttles.map(s => ({id: s.id, queue: s.driverQueue})));
    }

    // 4. Force Detour Pivot
    const currentLoc = `${bestShuttle.vehiclePos.lng},${bestShuttle.vehiclePos.lat}`;
    const endNode = bestShuttle.id === 'SHUTTLE-1' ? `77.6190,13.0440` : `77.6235,13.0485`; // Where they return to
    
    // Fetch precise ETA to the pickup location
    const pickupLoc = `${data.lng},${data.lat}`;
    const etaSeconds = await bestShuttle.fetchETA(`${currentLoc};${pickupLoc}`);
    if (etaSeconds !== null) {
      socket.emit('pickup_assigned', { shuttleId: bestShuttle.id, etaSeconds });
    }

    // Record stops for realistic pausing
    bestShuttle.stops.push({ lat: data.lat, lng: data.lng, type: 'pickup', stationId: data.stationId, socketId: socket.id });
    if (data.dropoffLat) bestShuttle.stops.push({ lat: data.dropoffLat, lng: data.dropoffLng, type: 'dropoff', stationId: data.dropoffId, socketId: socket.id });

    // Build Waypoints dynamically from all active stops so we don't abandon existing passengers
    let waypoints = `${currentLoc}`;
    let lastWP = waypoints;
    bestShuttle.stops.forEach(stop => {
      const wp = `${stop.lng},${stop.lat}`;
      if (wp !== lastWP) {
        waypoints += `;${wp}`;
        lastWP = wp;
      }
    });

    if (lastWP !== endNode) {
      waypoints += `;${endNode}`;
    }

    const newPath = await bestShuttle.fetchRoute(waypoints);
    if (newPath.length > 0) {
      // Prevent teleporting/jerking: find the closest index in the new path to our highly up-to-date current position
      let closestIdx = 0;
      let minD = Infinity;
      newPath.forEach((coord, idx) => {
        const d = getDistanceMeters(bestShuttle.vehiclePos.lat, bestShuttle.vehiclePos.lng, coord.lat, coord.lng);
        if (d < minD) {
          minD = d;
          closestIdx = idx;
        }
      });
      bestShuttle.routeIndex = closestIdx;
      
      // Update routes globally
      io.emit('route_path', shuttles.map(s => ({id: s.id, path: s.routeCoords}))); 
    }
  });

  // --- External Input Listeners ---
  socket.on('clear_passenger', ({shuttleId, stationId}) => {
    const s = shuttles.find(s => s.id === shuttleId);
    if(s) {
      s.driverQueue = s.driverQueue.filter(q => q.stationId !== stationId);
      s.passengers += 1; // Increment Live Display Count
      
      // If we were waiting for this specific station, resolve the lock early!
      if (s.waitingForDriver && s.waitingForDriver.stationId === stationId) {
        s.waitingForDriver = null;
        s.pauseTicks = 0; // Resume movement instantly!
      }

      // Update Driver UI
      io.emit('queue_update', shuttles.map(sh => ({id: sh.id, queue: sh.driverQueue})));
      
      // Update Employee UI explicitly verifying boarding success 
      io.emit('passenger_boarded', stationId); 
    }
  });

  // The Central Movement Metronome
  const simInterval = setInterval(() => {
    let payloads = [];
    shuttles.forEach(s => {
      if (s.waitingForDriver) {
        s.pauseTicks--;
        if (s.pauseTicks <= 0) {
          // Timeout occurred! Driver didn't confirm in 30 seconds.
          console.log(`[SHUTTLE] ${s.id} boarding timed out. Proceeding.`);
          io.to(s.waitingForDriver.socketId).emit('shuttle_missed');
          // Clear active passenger from driver queue
          s.driverQueue = s.driverQueue.filter(q => q.stationId !== s.waitingForDriver.stationId);
          io.emit('queue_update', shuttles.map(sh => ({id: sh.id, queue: s.driverQueue})));
          s.waitingForDriver = null; 
        }
      } else if (s.pauseTicks > 0) {
        s.pauseTicks--;
        if (s.pauseTicks === 0) console.log(`[SHUTTLE] ${s.id} dropoff wait complete. Resuming route.`);
      } else {
        if (s.routeCoords.length > 0) {
          // Normalize Shuttler Speed: Math interpolation so long straight OSRM lines don't make it travel 500km/h
          const speedPerTick = 15; // 15 meters per 1.5s = exactly 36 km/h
          
          if (s.routeIndex < s.routeCoords.length - 1) {
            const target = s.routeCoords[s.routeIndex + 1];
            const dist = getDistanceMeters(s.vehiclePos.lat, s.vehiclePos.lng, target.lat, target.lng);
            
            if (dist <= speedPerTick && dist > 0) {
              s.routeIndex++;
              s.vehiclePos = s.routeCoords[s.routeIndex];
            } else if (dist > speedPerTick) {
              const fraction = speedPerTick / dist;
              s.vehiclePos = {
                lat: s.vehiclePos.lat + (target.lat - s.vehiclePos.lat) * fraction,
                lng: s.vehiclePos.lng + (target.lng - s.vehiclePos.lng) * fraction
              };
            }
            
            // Check if we arrived near a station stop (< 40 meters)
            const stopIndex = s.stops.findIndex(stop => getDistanceMeters(s.vehiclePos.lat, s.vehiclePos.lng, stop.lat, stop.lng) < 40);
            if (stopIndex !== -1) {
              const stopInfo = s.stops.splice(stopIndex, 1)[0];
              if (stopInfo.type === 'pickup') {
                s.waitingForDriver = stopInfo;
                s.pauseTicks = 20; // 30 seconds wait timer
                io.to(stopInfo.socketId).emit('shuttle_arrived');
                console.log(`[SHUTTLE] ${s.id} arrived at pickup! Waiting for driver confirmation...`);
              } else {
                s.pauseTicks = 4; // 6 seconds wait for dropoff
                s.passengers = Math.max(0, s.passengers - 1); // Decrement count
                io.to(stopInfo.socketId).emit('passenger_dropped_off');
                console.log(`[SHUTTLE] ${s.id} arrived at dropoff! Passengers alighting...`);
              }
            }
            
          } else {
            s.routeIndex = 0;
            if (s.routeCoords.length > 0) s.vehiclePos = s.routeCoords[0];
          }
        }
      }
      
      payloads.push({  
        id: s.id, 
        lat: s.vehiclePos.lat, 
        lng: s.vehiclePos.lng, 
        passengers: s.passengers,
        waitingForStation: s.waitingForDriver ? s.waitingForDriver.stationId : null
      });
    });
    // Broadcast all shuttles simultaneously
    io.emit('shuttles_update', payloads);
  }, 1500);

  socket.on('disconnect', () => clearInterval(simInterval));
});

module.exports = server;
