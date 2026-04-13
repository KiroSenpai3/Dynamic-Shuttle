import { io } from 'socket.io-client';

const URL = 'http://localhost:5000';
export const socket = io(URL, {
  autoConnect: false // We explicitly connect in the React component
});
