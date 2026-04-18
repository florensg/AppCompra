import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAFri4OdzvY_HJ7bQFQe0VC1QJbqpNjKj8",
  authDomain: "mis-compras-47b5c.firebaseapp.com",
  projectId: "mis-compras-47b5c",
  storageBucket: "mis-compras-47b5c.firebasestorage.app",
  messagingSenderId: "631438223409",
  appId: "1:631438223409:web:28ba370a95e6284d0b0d10"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
export const auth = getAuth(app);
export const db = getFirestore(app);
