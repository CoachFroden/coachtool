import { auth, db } from "./firebase-refleksjon.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const userLine = document.getElementById("userLine");
const logoutBtn = document.getElementById("logoutBtn");
const openOverviewBtn = document.getElementById("openOverviewBtn");
const adminToggle = document.getElementById("adminToggle");
const adminPanel = document.getElementById("adminPanel");

openOverviewBtn?.addEventListener("click", () => {
  window.location.href = "oversikt.html";
});

adminToggle?.addEventListener("click", () => {
  const open = adminPanel?.classList.toggle("isOpen");
  adminToggle.setAttribute("aria-expanded", String(Boolean(open)));
});

logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists() || snap.data()?.role !== "coach") {
    await signOut(auth);
    window.location.href = "index.html";
    return;
  }

  if (userLine) {
    userLine.textContent = user.email || "Innlogget trener";
  }
});
