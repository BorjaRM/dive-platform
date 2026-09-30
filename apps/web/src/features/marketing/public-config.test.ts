import { describe, expect, it } from 'vitest';
import { readPublicProductConfig } from './public-config';

const validEnvironment = {
  PUBLIC_PRODUCT_ORIGIN: 'https://bluecurrent.example',
  PUBLIC_PRODUCT_CONTACT_EMAIL: 'hola@bluecurrent.example',
  PUBLIC_PRODUCT_INDEXABLE: 'true',
};

describe('readPublicProductConfig', () => {
  it('reads the configured canonical origin, contact, and indexing state', () => {
    expect(readPublicProductConfig(validEnvironment)).toEqual({
      canonicalOrigin: new URL('https://bluecurrent.example'),
      contactEmail: 'hola@bluecurrent.example',
      indexable: true,
    });
  });

  it.each([
    'PUBLIC_PRODUCT_ORIGIN',
    'PUBLIC_PRODUCT_CONTACT_EMAIL',
    'PUBLIC_PRODUCT_INDEXABLE',
  ])('fails when %s is missing', (name) => {
    const environment = { ...validEnvironment };
    delete environment[name as keyof typeof environment];

    expect(() => readPublicProductConfig(environment)).toThrow(name);
  });

  it('rejects www and non-origin product configuration', () => {
    expect(() =>
      readPublicProductConfig({
        ...validEnvironment,
        PUBLIC_PRODUCT_ORIGIN: 'https://www.bluecurrent.example/landing',
      }),
    ).toThrow('PUBLIC_PRODUCT_ORIGIN');
  });

  it('rejects invalid contact and indexing configuration', () => {
    expect(() =>
      readPublicProductConfig({
        ...validEnvironment,
        PUBLIC_PRODUCT_CONTACT_EMAIL: 'not-an-email',
      }),
    ).toThrow('PUBLIC_PRODUCT_CONTACT_EMAIL');

    expect(() =>
      readPublicProductConfig({
        ...validEnvironment,
        PUBLIC_PRODUCT_INDEXABLE: 'yes',
      }),
    ).toThrow('PUBLIC_PRODUCT_INDEXABLE');
  });
});
