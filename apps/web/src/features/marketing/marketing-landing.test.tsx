import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketingLanding } from './marketing-landing';

describe('MarketingLanding', () => {
  it('renders Spanish product content with one configured contact action', () => {
    render(<MarketingLanding contactEmail="hola@bluecurrent.example" />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Más tiempo para el agua. Más claridad para tu equipo.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Software para centros de buceo'),
    ).toBeInTheDocument();

    const contactLink = screen.getByRole('link', { name: /Solicitar acceso/u });
    expect(contactLink).toHaveAttribute(
      'href',
      'mailto:hola@bluecurrent.example',
    );
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(document.querySelector('form')).not.toBeInTheDocument();
  });

  it('does not include authentication, pricing, or tracking copy', () => {
    render(<MarketingLanding contactEmail="hola@bluecurrent.example" />);

    const pageText = document.body.textContent?.toLowerCase() ?? '';
    expect(pageText).not.toMatch(
      /iniciar sesión|iniciar sesion|registro|registrar|precio|precios|checkout|analytics|tracking/u,
    );
  });
});
