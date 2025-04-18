// --- Web Audio API for Beep ---
let audioContext;
function playBeep() {
	try {
		if (!audioContext) {
			// Lazy initialization
			audioContext = new (window.AudioContext || window.webkitAudioContext)();
		}
		// Resume context if it was suspended (e.g., due to browser policy)
		if (audioContext.state === 'suspended') {
			audioContext.resume();
		}
		const oscillator = audioContext.createOscillator();
		const gainNode = audioContext.createGain();
		oscillator.connect(gainNode);
		gainNode.connect(audioContext.destination);
		// Set volume (gain) - start reasonably quiet, then fade out quickly
		gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
		gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.1);
		// Oscillator settings
		oscillator.type = 'sine'; // A simple, clean tone
		oscillator.frequency.setValueAtTime(660, audioContext.currentTime); // A reasonable pitch (E5)
		// Start and stop the sound
		oscillator.start(audioContext.currentTime);
		oscillator.stop(audioContext.currentTime + 0.1); // Play for 100ms
	} catch (e) {
		// Log error if Web Audio API is not supported or fails
		console.error("Web Audio API beep failed:", e);
	}
}