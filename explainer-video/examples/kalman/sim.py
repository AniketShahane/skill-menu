"""Shared simulation data for the 1D cart story (scalar Kalman filter, exact model)."""
import numpy as np

DT, N = 1.0, 60
SIG_U, SIG_Z = 0.35, 1.5          # odometer speed noise (m/s), GPS noise (m)
Q, R = (SIG_U * DT) ** 2, SIG_Z ** 2
X0, P0 = 0.0, 4.0                 # initial belief

def simulate(seed):
    rng = np.random.default_rng(seed)
    k = np.arange(N + 1)
    u_true = 1.5 * np.cos(2 * np.pi * k / 30)
    x = np.zeros(N + 1); x[0] = 0.0
    for i in range(1, N + 1):
        x[i] = x[i - 1] + u_true[i - 1] * DT
    u_meas = u_true + rng.normal(0, SIG_U, N + 1)
    z = x + rng.normal(0, SIG_Z, N + 1)
    dr = np.zeros(N + 1); dr[0] = X0
    for i in range(1, N + 1):
        dr[i] = dr[i - 1] + u_meas[i - 1] * DT
    # Kalman filter: predict with odometer, update with GPS. Step 0 = update only.
    mu, P = np.zeros(N + 1), np.zeros(N + 1)
    mu_pr, P_pr, K = np.zeros(N + 1), np.zeros(N + 1), np.zeros(N + 1)
    m, p = X0, P0
    for i in range(N + 1):
        if i > 0:
            m, p = m + u_meas[i - 1] * DT, p + Q
        mu_pr[i], P_pr[i] = m, p
        K[i] = p / (p + R)
        m, p = m + K[i] * (z[i] - m), (1 - K[i]) * p
        mu[i], P[i] = m, p
    return dict(k=k, x=x, z=z, dr=dr, mu=mu, P=P, mu_pr=mu_pr, P_pr=P_pr, K=K, u_meas=u_meas)

def stats(d):
    rm = lambda e: float(np.sqrt(np.mean(e ** 2)))
    inside = np.mean(np.abs(d["x"] - d["mu"]) <= 2 * np.sqrt(d["P"]))
    return rm(d["z"] - d["x"]), rm(d["mu"] - d["x"]), float(d["dr"][-1] - d["x"][-1]), float(inside)

SEED = 25
if __name__ == "__main__":
    for s in range(40):
        g, f, drift, ins = stats(simulate(s))
        print(f"seed {s:2d}  gps {g:.2f}  kf {f:.2f}  wheel drift {drift:+.2f}  in2sig {ins:.2f}")
