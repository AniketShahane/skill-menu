> Planning draft. The final narration (with all 15 Gate-1 review fixes) lives in the scene files; `python tts.py --list s*.py` prints it.

# Kalman filters — video script (3Blue1Brown-style, Manim)

Colors: truth = white/grey, prediction (prior) = BLUE, measurement = YELLOW, estimate (posterior) = GREEN.

## 1. Hook — two imperfect sources
Visual: cart on a track. Blue ghost = wheel-odometry prediction (drifts). Yellow dot = GPS (jitters). Teaser: green estimate hugs truth.
- Imagine you're trying to track a little cart rolling along a track.
- You have two ways of knowing where it is. First, the wheels. By measuring how fast they turn, you can predict where the cart should be.
- But small errors in that speed add up. Over time, the prediction drifts away from the truth.
- Second, a GPS sensor. It never drifts, but every single reading is noisy, jumping around the true position.
- One source is smooth, but drifts. The other doesn't drift, but it's jittery. Neither is good enough on its own.
- So how should you combine them? The answer is the Kalman filter. And by the end of this video, you'll see it's just a few simple ideas, stacked on top of each other.

## 2. Idea 1 — a belief is a bell curve
- First idea. When we say where the cart is, we shouldn't give a single number. We should describe our belief.
- A great way to do that is with a bell curve, a Gaussian. Its peak, the mean, mu, is our best guess.
- Its width, set by the standard deviation, sigma, says how unsure we are.
- A narrow curve means we're confident. A wide curve means the cart could be almost anywhere nearby.
- We'll often use sigma squared, the variance. As you'll see, variances are the quantities that combine nicely.
- From now on, every estimate is a curve, not a point.

## 3. Idea 2 — combining two beliefs (Bayes, product of Gaussians)
- Second idea, and this is the heart of everything. Suppose our prediction says the cart is around here, with some uncertainty.
- And the GPS says it's around here, with its own uncertainty.
- What should we believe now? Intuitively, something in between, but closer to whichever source is more certain.
- Here's the principled way. For every possible position, ask how plausible it is according to the prediction, and how plausible it is according to the measurement. Then multiply the two.
- Positions that both sources find plausible survive. Positions that either one rules out get crushed.
- Rescale so the total area is one, and remarkably, the product of two Gaussians is another Gaussian. This is Bayes' rule in action.
- And notice, the new curve is narrower than both of the originals. Combining two independent pieces of information leaves you more certain than either one alone.
- Work out the algebra, and the new mean is a weighted average of the two means, where each is weighted by the *other one's* variance. The noisier source gets less say.
- The variances combine like this: one over the new variance equals the sum of one over each variance. One over the variance is a measure of certainty, called precision. And precisions simply add.
- Watch what happens as the GPS gets more precise. The combined belief slides toward it and tightens. Make the GPS sloppy, and we mostly stick with our prediction.

Formulas: mu = (s_z^2 mu_p + s_p^2 z)/(s_p^2 + s_z^2);  1/s^2 = 1/s_p^2 + 1/s_z^2.

## 4. The Kalman gain
- Let's rewrite that weighted average in a more suggestive way.
- Start at the prediction. Look at the gap between what the sensor said, and what you expected. This gap is called the innovation. It's the surprise.
- Then move a fraction K of the way across that gap.
- That fraction, K, is the Kalman gain. It's the prediction's variance, divided by the total variance.
- K is always between zero and one. If the sensor is terrible compared to our prediction, K is near zero, and we barely move. If the sensor is excellent, K is near one, and we jump almost all the way to it.
- And the new variance is just one minus K, times the old one. The more we trust the measurement, the more our uncertainty shrinks.
- That's the whole update step. Predict, compare, nudge by K.

Formulas: K = s_p^2/(s_p^2+s_z^2); mu = mu_p + K (z - mu_p); s^2 = (1-K) s_p^2.

## 5. Idea 3 — time: the prediction step
- Third idea: time. The cart keeps moving, so our belief has to move too.
- If the wheels say the cart moves at speed u, then after a time step, delta t, our best guess shifts forward by u times delta t.
- But the wheel speed isn't perfect, and its errors are unpredictable. So as the curve slides forward, it also spreads out.
- When independent random errors add up, their variances add. So the new variance is the old variance plus q, the variance of the fresh error from this step. It's called process noise.
- Prediction always makes us less certain. Measurement always makes us more certain.
- And the Kalman filter is just these two steps, over and over. Predict: slide and spread. Update: compare and tighten.
- Watch the uncertainty. It breathes: out with each prediction, in with each measurement. And it quickly settles into a steady rhythm, where the spread added by each prediction is exactly balanced by what each measurement removes.

Formulas: mu_p = mu + u dt;  s_p^2 = s^2 + q.

## 6. Demo — the cart, all together
- Let's put it all together on our cart.
- Here's the truth, the GPS readings, and the drifting wheel prediction.
- And here's the Kalman filter, with a shaded band showing two standard deviations of its uncertainty.
- It's smoother than the GPS, and unlike the wheels, it never drifts away. It takes the best of both.
- And the truth stays inside the band about ninety-five percent of the time. The filter isn't just accurate, it's honest about how unsure it is.
- Watch the gain K, too. It starts high, because at first we know very little, then settles to a constant value, matching the steady rhythm we saw.

## 7. Two dimensions — learning what you can't see
- Now for the part that feels like magic. What if there are no wheel sensors at all, only GPS? Can we still predict where the cart is going?
- Yes, if we also keep track of velocity. Now our state is two numbers, position and velocity. A Gaussian belief in two dimensions looks like an ellipse, here a cloud of possibilities.
- Suppose at first we know the position fairly well, but the velocity hardly at all. A tall, thin ellipse.
- Now predict one second ahead. A faster cart will have moved further. So every possibility slides right by an amount equal to its velocity.
- The ellipse shears, and tilts. Position and velocity have become correlated. If the cart turns out to be further ahead than expected, it was probably moving faster. (Plus a little extra spread for unpredictable pushes.)
- Now a GPS reading arrives. It only tells us about position: a vertical band.
- Weight each possibility by how well it agrees with the reading. The ellipse shrinks along position, as you'd expect. But because it's tilted, it also shrinks in velocity. We just learned the cart's speed, without ever measuring speed.
- This is the real power of the Kalman filter. Through correlations created by the physics, it infers the things it can't see directly.
- Repeat, and the estimate locks onto the true velocity.

Numbers: dt=1, F=[[1,1],[0,1]], P0=diag(0.25,4), H=[1,0], R=0.25, truth v=1.2.

## 8. The general equations
- With many variables, the mean becomes a vector, x hat, and the variance becomes a covariance matrix, P. But the equations are the ones we've already built.
- Predict: move the estimate with the motion model, F. Transform the uncertainty, F P F-transpose, which is exactly the shear we just saw. Then add the process noise, Q.
- Update: the gain K is still prediction uncertainty divided by total uncertainty. H converts the state into what the sensor measures, and R is the sensor noise.
- Then nudge the estimate by K times the innovation, and shrink the covariance.
- Every symbol here has a one-dimensional twin that we already understand.

## 9. Closing
- When the system is linear, and the noise is Gaussian with known variances, this simple recipe is provably optimal. No other estimator has a smaller average squared error.
- When things aren't linear, variants like the extended and unscented Kalman filters apply the same ideas, approximately.
- It helped navigate Apollo to the Moon. And its descendants run inside phones, cars, drones, and countless robots.
- And at its core is one humble idea. Every estimate is a belief. Predict, and the belief spreads out. Measure, and it sharpens. Blend the two, weighted by how much you trust each.
- Thanks for watching.
