import "./styles.css";
async function start() {
  // Socket.IO captures WebSocket during module evaluation. Start interception first.
  if (import.meta.env.VITE_ENABLE_MOCKS !== "false") {
    const { startMocks } = await import("./mocks/browser");
    await startMocks();
  }
  await import("./bootstrap");
}
start().catch((error) => {
  console.error(error);
  document.getElementById("root")!.textContent =
    "Não foi possível iniciar o marketplace. Recarregue a página.";
});
