export function formatCoordinate(value?: number) {
  return typeof value === 'number' && !Number.isNaN(value) ? value.toFixed(6) : 'Not available';
}

export function formatSignatureLocation(input: {
  label?: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
}) {
  const coordinates = `Lat ${formatCoordinate(input.latitude)}, Lng ${formatCoordinate(input.longitude)}`;
  const accuracy = typeof input.accuracyMeters === 'number' && !Number.isNaN(input.accuracyMeters)
    ? `, accuracy approx. ${Math.round(input.accuracyMeters)} m`
    : '';

  if (input.label?.trim()) {
    return `${input.label.trim()} (${coordinates}${accuracy})`;
  }

  return `${coordinates}${accuracy}`;
}

export function buildGoogleMapsLink(latitude?: number, longitude?: number) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return '';
  }

  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

export function buildLocationBucket(label?: string, latitude?: number, longitude?: number) {
  if (label?.trim()) {
    return label.trim();
  }

  if (typeof latitude === 'number' && typeof longitude === 'number' && !Number.isNaN(latitude) && !Number.isNaN(longitude)) {
    return `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
  }

  return 'Location unavailable';
}
