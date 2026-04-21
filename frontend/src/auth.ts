import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
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
export async function signIn(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    const code = String(error?.code || "");
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw error;
  }
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
