import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut, 
  onAuthStateChanged,
  User
} from "firebase/auth";
import { auth } from "./firebaseConfig";

const googleProvider = new GoogleAuthProvider();

/**
 * Inicia sesión con Google usando el popup de Firebase Auth.
 * Nota: Ya no pedimos el scope de Spreadsheets aquí para evitar la pantalla roja.
 */
export async function signIn(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

/**
 * Cierra la sesión del usuario.
 */
export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

/**
 * Escucha cambios en el estado de autenticación.
 */
export function onAuthStatusChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
