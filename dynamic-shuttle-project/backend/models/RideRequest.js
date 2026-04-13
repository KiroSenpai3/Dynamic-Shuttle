const mongoose = require('mongoose');

const rideRequestSchema = new mongoose.Schema({
  passengerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { 
    type: String, 
    enum: ['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'],
    default: 'PENDING'
  },
  pickupLocation: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  dropoffLocation: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  assignedVehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  requestTime: { type: Date, default: Date.now },
  assignedTime: { type: Date },
  pickupTime: { type: Date },
  dropoffTime: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('RideRequest', rideRequestSchema);
