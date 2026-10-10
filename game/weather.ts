import { FORECAST_ACCURACY, WEATHER_BASE_WEIGHTS, WEATHER_SCALE } from './config';
import type { Rng } from './rng';
import type { ForecastDay, Weather } from './types';

/** Weather has memory: dry spells and wet spells persist; storms rarely follow storms. */
export function nextWeather(rng: Rng, prev: Weather): Weather {
  const weights = { ...WEATHER_BASE_WEIGHTS };
  weights[prev] *= prev === 'storm' ? 0.3 : prev === 'heatwave' ? 2.5 : 1.8;
  if (prev === 'heatwave') weights.sunny *= 1.4;
  if (prev === 'heavyRain' || prev === 'storm') weights.rain *= 1.5;
  return rng.weighted(weights);
}

export function initialWeatherQueue(rng: Rng): Weather[] {
  // A gentle start so the first days are about learning, not firefighting.
  const queue: Weather[] = ['sunny', 'cloudy'];
  while (queue.length < FORECAST_ACCURACY.length) queue.push(nextWeather(rng, queue[queue.length - 1]));
  return queue;
}

/** What the player sees. Further-out days are more likely to show a neighbouring kind of weather. */
export function buildForecast(rng: Rng, queue: Weather[], today: number): ForecastDay[] {
  return queue.map((truth, i) => {
    const confidence = FORECAST_ACCURACY[i];
    if (rng.chance(confidence)) return { day: today + i + 1, weather: truth, confidence };
    const idx = WEATHER_SCALE.indexOf(truth);
    const step = idx === 0 ? 1 : idx === WEATHER_SCALE.length - 1 ? -1 : rng.chance(0.5) ? 1 : -1;
    return { day: today + i + 1, weather: WEATHER_SCALE[idx + step], confidence };
  });
}

export const isWet = (w: Weather) => w === 'rain' || w === 'heavyRain' || w === 'storm';
