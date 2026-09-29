// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCt4cl0WxLEIFJN9XlEgFPrO2_oCt-IR4Q",
  authDomain: "respuestas-c4874.firebaseapp.com",
  projectId: "respuestas-c4874",
  storageBucket: "respuestas-c4874.firebasestorage.app",
  messagingSenderId: "969748720376",
  appId: "1:969748720376:web:0a0a24404a2c08b88ca90d",
  measurementId: "G-2Q1W0YYW0H"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);