import { describe, expect, it } from 'vitest';
import { classifyProductHost } from './host-routing';
import type { PublicProductConfig } from './public-config';

const config: PublicProductConfig = {
  canonicalOrigin: new URL('https://bluecurrent.example'),
  contactEmail: 'hola@bluecurrent.example',
  indexable: true,
};

describe('classifyProductHost', () => {
  it('serves the exact canonical apex host', () => {
    expect(classifyProductHost('bluecurrent.example', config)).toEqual({
      kind: 'serve',
    });
  });

  it('redirects www to the canonical apex host', () => {
    expect(classifyProductHost('www.bluecurrent.example', config)).toEqual({
      kind: 'redirect',
      location: 'https://bluecurrent.example',
    });
  });

  it.each([
    'center.app.bluecurrent.example',
    'bluecurrent.preview.example',
    'malformed host',
  ])('fails closed for %s', (host) => {
    expect(classifyProductHost(host, config)).toEqual({ kind: 'not-found' });
  });
});
