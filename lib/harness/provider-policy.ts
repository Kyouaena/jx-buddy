// Configuration does not establish production reachability. iFinD requires an
// explicit enable flag after a successful probe from the deployed environment.
export function mappedProviderEnabled(provider: string, configured: boolean, ifindEnabled?: string, diagnostic = false) {
  return configured && (provider !== 'ifind' || diagnostic || ifindEnabled === 'true');
}
