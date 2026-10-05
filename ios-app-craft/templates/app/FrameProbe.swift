import QuartzCore
import UIKit

// FrameProbe: the app's half of the motion guardrail. It logs frames and finger lifts, and runs a
// status-bar beacon.
//
// What: launched with APP_FRAME_LOG=<path>, a display link at the screen's top rate appends one
// line per frame (`timestamp targetTimestamp`, CACurrentMediaTime seconds) and one line per finger
// lift (`# touch <t>`). A 12x8 pt beacon in the status bar flips black/white every frame.
// Without the variable it does nothing: no link, no layer, no file.
//
// Wire in: add to the app target and call `FrameProbe.shared.startIfRequested()` first thing in the
// App's init (or application(_:didFinishLaunchingWithOptions:)). MotionTestCase sets the variable;
// scripts/motion_report.py reads the log. If your prefix is not APP_, change `envKey` and
// MotionTestCase.frameLogKey together. Set `CADisableMinimumFrameDurationOnPhone = YES` in Info.plist.
// Without it an iPhone caps every animation at 60 Hz, whatever a display link asks for.
//
// Lessons it encodes:
// - Log on the app's own clock. On the simulator, CACurrentMediaTime is shared by the app, the UI
//   test process and UIEvent timestamps, so a test's marks cut this log exactly.
// - A callback that arrives after the frame it was meant for is a hitch: the main thread was busy
//   and the screen showed the old picture again.
// - Time a response from the real finger lift, not from when the test asked for the tap. XCUITest
//   reads the whole accessibility tree before each tap, work a user's phone never does.
// - The simulator's recorder saves only frames that differ. A still screen then leaves no frames,
//   and a frame the recorder dropped looks like a snap. The beacon changes every frame, so every
//   frame shown gets saved and any gap is the recorder's own. The analyser crops the status bar
//   (detector.status_bar_share), so keep the beacon inside that strip.
// - Asking for the top rate keeps a ProMotion screen at 120 Hz while measuring: the hardest case.
// - The log appends, so a journey that relaunches the app keeps one timeline. The script deletes
//   the log before each run.
// - Simulator only as wired: the path is a Mac path both processes can write. On a device, use
//   Instruments' Animation Hitches or XCTHitchMetric instead.
@MainActor
final class FrameProbe: NSObject {
    /// The launch environment variable that names the log file. Keep it equal to MotionTestCase.frameLogKey.
    nonisolated static let envKey = "APP_FRAME_LOG"
    /// Where the beacon blinks, in window points: in the status bar, clear of the clock, and inside
    /// the top strip the analyser leaves out (6% of the screen height by default).
    static var beaconFrame = CGRect(x: 110, y: 0, width: 12, height: 8)

    static let shared = FrameProbe()

    private var link: CADisplayLink?
    private let beacon = CALayer()
    private var beaconOn = false
    private var wroteRate = false
    private var buffer: [String] = []
    private var lastFlush: CFTimeInterval = 0
    private var handle: FileHandle?
    private let writer = DispatchQueue(label: "frameprobe.writer", qos: .utility)

    func startIfRequested(envKey: String = FrameProbe.envKey) {
        guard link == nil, let path = ProcessInfo.processInfo.environment[envKey], !path.isEmpty else { return }
        if !FileManager.default.fileExists(atPath: path) {
            FileManager.default.createFile(atPath: path, contents: nil)
        }
        guard let handle = FileHandle(forWritingAtPath: path) else { return }
        _ = try? handle.seekToEnd()
        self.handle = handle

        write(String(format: "# start %.6f\n", CACurrentMediaTime()))
        // Ask for 120 until a window says what its screen can do (UIScreen.main is deprecated in
        // iOS 26, and no scene exists this early). The system clamps to what the screen allows.
        let link = CADisplayLink(target: self, selector: #selector(tick(_:)))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 120, maximum: 120, preferred: 120)
        // .common: frames keep coming while a scroll view tracks a finger.
        link.add(to: .main, forMode: .common)
        self.link = link

        // Windows do not exist yet at launch. Each one gets the touch logger when it first shows.
        NotificationCenter.default.addObserver(forName: UIWindow.didBecomeVisibleNotification, object: nil, queue: .main) { note in
            guard let window = note.object as? UIWindow else { return }
            MainActor.assumeIsolated { FrameProbe.shared.attach(to: window) }
        }
        for scene in UIApplication.shared.connectedScenes {
            for window in (scene as? UIWindowScene)?.windows ?? [] { attach(to: window) }
        }
    }

    private func attach(to window: UIWindow) {
        // The screen's top rate, once: the analyser reads `# maxfps` as the refresh interval.
        if !wroteRate, let screen = window.windowScene?.screen {
            wroteRate = true
            let max = screen.maximumFramesPerSecond
            link?.preferredFrameRateRange = CAFrameRateRange(minimum: Float(max), maximum: Float(max), preferred: Float(max))
            write("# maxfps \(max)\n")
        }
        if !(window.gestureRecognizers ?? []).contains(where: { $0 is TouchLogger }) {
            window.addGestureRecognizer(TouchLogger { [weak self] time in
                self?.write(String(format: "# touch %.6f\n", time))
            })
        }
        // The beacon goes on the app's own window, above everything presented in it.
        if beacon.superlayer == nil, window.windowLevel == .normal {
            beacon.frame = Self.beaconFrame
            beacon.zPosition = 10_000
            window.layer.addSublayer(beacon)
        }
    }

    @objc private func tick(_ link: CADisplayLink) {
        beaconOn.toggle()
        CATransaction.begin()
        CATransaction.setDisableActions(true) // no implicit fade: one clean change per frame
        beacon.backgroundColor = (beaconOn ? UIColor.black : UIColor.white).cgColor
        CATransaction.commit()
        buffer.append(String(format: "%.6f %.6f\n", link.timestamp, link.targetTimestamp))
        // Written in half-second batches off the main thread. A write per frame would itself cost
        // frames; a batch this size loses at most half a second if the app is killed.
        if link.timestamp - lastFlush >= 0.5 {
            lastFlush = link.timestamp
            write(buffer.joined())
            buffer.removeAll(keepingCapacity: true)
        }
    }

    private func write(_ text: String) {
        guard let handle else { return }
        let data = Data(text.utf8)
        writer.async { try? handle.write(contentsOf: data) }
    }
}

/// Sees every touch in a window without taking part. It never recognises, never delays or cancels
/// anything, and reports when the last finger lifts.
private final class TouchLogger: UIGestureRecognizer, UIGestureRecognizerDelegate {
    private let lifted: (TimeInterval) -> Void

    init(lifted: @escaping (TimeInterval) -> Void) {
        self.lifted = lifted
        super.init(target: nil, action: nil)
        cancelsTouchesInView = false
        delaysTouchesBegan = false
        delaysTouchesEnded = false
        delegate = self
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        if event.allTouches?.allSatisfy({ $0.phase == .ended || $0.phase == .cancelled }) ?? true {
            // The event's own time: when the finger lifted, not when the busy main thread got to it.
            lifted(event.timestamp)
            state = .failed
        }
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) { state = .failed }

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }
}
