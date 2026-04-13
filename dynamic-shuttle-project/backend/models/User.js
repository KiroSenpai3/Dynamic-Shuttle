const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, enum: ['EMPLOYEE', 'DRIVER', 'ADMIN'], default: 'EMPLOYEE' },
  currentLocation: {
    lat: { type: Number },
    lng: { type: Number }
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
