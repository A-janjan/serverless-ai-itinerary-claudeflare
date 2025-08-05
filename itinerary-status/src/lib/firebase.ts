// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from 'firebase/firestore';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "WRITE YOUR FIREBASE API KEY HERE", 
  authDomain: "ai-itinerary-selected-team.firebaseapp.com",
  projectId: "ai-itinerary-selected-team",
  storageBucket: "ai-itinerary-selected-team.firebasestorage.app",
  messagingSenderId: "817698216702",
  appId: "1:817698216702:web:2e89dbe76877eee50b63af",
  measurementId: "G-03FN46LRLD"
};

let db: ReturnType<typeof getFirestore> | null = null;

// Initialize Firebase only in the browser
if (typeof window !== 'undefined') {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}

export { db };