/**
 * Spring physics — zero-dependency port of charmbracelet/harmonica.
 *
 * A simplified damped harmonic oscillator ported from Ryan Juckett's
 * simple damped harmonic motion, originally written in C++.
 *
 * @see https://www.ryanjuckett.com/damped-springs/
 * @see https://github.com/charmbracelet/harmonica
 */

// Machine epsilon — smallest representable difference from 1.0
const epsilon = Number.EPSILON;

/**
 * FPS returns the time delta (in seconds) for the given frame rate.
 *
 * Example: FPS(60) → 1/60 ≈ 0.01667
 */
export function FPS(n: number): number {
  return 1.0 / n;
}

/**
 * Precomputed spring coefficients. These are cached after creation
 * so each Update() call is just two multiply-add operations.
 */
export interface Spring {
  readonly posPosCoef: number;
  readonly posVelCoef: number;
  readonly velPosCoef: number;
  readonly velVelCoef: number;
}

/**
 * NewSpring computes the parameters needed to simulate a damped spring
 * over a given period of time.
 *
 * @param deltaTime - Time step to advance (e.g. FPS(60))
 * @param angularFrequency - Angular frequency of motion (speed)
 * @param dampingRatio - Damping ratio:
 *   - > 1: over-damped (no oscillation, slow to equilibrium)
 *   - = 1: critically damped (fastest without oscillation)
 *   - < 1: under-damped (oscillates, fastest to equilibrium)
 */
export function NewSpring(
  deltaTime: number,
  angularFrequency: number,
  dampingRatio: number,
): Spring {
  angularFrequency = Math.max(0.0, angularFrequency);
  dampingRatio = Math.max(0.0, dampingRatio);

  // If there is no angular frequency, the spring will not move.
  if (angularFrequency < epsilon) {
    return {
      posPosCoef: 1.0,
      posVelCoef: 0.0,
      velPosCoef: 0.0,
      velVelCoef: 1.0,
    };
  }

  let posPosCoef: number;
  let posVelCoef: number;
  let velPosCoef: number;
  let velVelCoef: number;

  if (dampingRatio > 1.0 + epsilon) {
    // Over-damped
    const za = -angularFrequency * dampingRatio;
    const zb = angularFrequency * Math.sqrt(dampingRatio * dampingRatio - 1.0);
    const z1 = za - zb;
    const z2 = za + zb;

    const e1 = Math.exp(z1 * deltaTime);
    const e2 = Math.exp(z2 * deltaTime);

    const invTwoZb = 1.0 / (2.0 * zb);

    const e1_Over_TwoZb = e1 * invTwoZb;
    const e2_Over_TwoZb = e2 * invTwoZb;

    const z1e1_Over_TwoZb = z1 * e1_Over_TwoZb;
    const z2e2_Over_TwoZb = z2 * e2_Over_TwoZb;

    posPosCoef = e1_Over_TwoZb * z2 - z2e2_Over_TwoZb + e2;
    posVelCoef = -e1_Over_TwoZb + e2_Over_TwoZb;

    velPosCoef = (z1e1_Over_TwoZb - z2e2_Over_TwoZb + e2) * z2;
    velVelCoef = -z1e1_Over_TwoZb + z2e2_Over_TwoZb;
  } else if (dampingRatio < 1.0 - epsilon) {
    // Under-damped
    const omegaZeta = angularFrequency * dampingRatio;
    const alpha = angularFrequency * Math.sqrt(1.0 - dampingRatio * dampingRatio);

    const expTerm = Math.exp(-omegaZeta * deltaTime);
    const cosTerm = Math.cos(alpha * deltaTime);
    const sinTerm = Math.sin(alpha * deltaTime);

    const invAlpha = 1.0 / alpha;

    const expSin = expTerm * sinTerm;
    const expCos = expTerm * cosTerm;
    const expOmegaZetaSin_Over_Alpha = expTerm * omegaZeta * sinTerm * invAlpha;

    posPosCoef = expCos + expOmegaZetaSin_Over_Alpha;
    posVelCoef = expSin * invAlpha;

    velPosCoef = -expSin * alpha - omegaZeta * expOmegaZetaSin_Over_Alpha;
    velVelCoef = expCos - expOmegaZetaSin_Over_Alpha;
  } else {
    // Critically damped
    const expTerm = Math.exp(-angularFrequency * deltaTime);
    const timeExp = deltaTime * expTerm;
    const timeExpFreq = timeExp * angularFrequency;

    posPosCoef = timeExpFreq + expTerm;
    posVelCoef = timeExp;

    velPosCoef = -angularFrequency * timeExpFreq;
    velVelCoef = -timeExpFreq + expTerm;
  }

  return { posPosCoef, posVelCoef, velPosCoef, velVelCoef };
}

/**
 * Update position and velocity using precomputed spring coefficients.
 *
 * @returns [newPosition, newVelocity]
 */
export function springUpdate(
  spring: Spring,
  pos: number,
  vel: number,
  equilibriumPos: number,
): [number, number] {
  const oldPos = pos - equilibriumPos;
  const oldVel = vel;

  const newPos = oldPos * spring.posPosCoef + oldVel * spring.posVelCoef + equilibriumPos;
  const newVel = oldPos * spring.velPosCoef + oldVel * spring.velVelCoef;

  return [newPos, newVel];
}
