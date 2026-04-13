const mongoose = require('mongoose');

const queueStepSchema = new mongoose.Schema({
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  type: { type: String, enum: ['PICKUP', 'DROPOFF'], required: true },
  passengerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: false });

const vehicleSchema = new mongoose.Schema({
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  capacity: { type: Number, default: 10 },
  activePassengers: { type: Number, default: 0 },
  status: { type: String, enum: ['IDLE', 'ROUTING', 'FULL', 'MAINTENANCE'], default: 'IDLE' },
  currentLocation: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  routeQueue: [queueStepSchema],
  lastPingTime: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Vehicle', vehicleSchema);
