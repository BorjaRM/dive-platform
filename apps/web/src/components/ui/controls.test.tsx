import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Badge, Button, Input, Notice, Select } from './controls';

describe('shared visual controls', () => {
  it('defaults to a non-submitting button and permits explicit submission', () => {
    const submit = vi.fn((event) => event.preventDefault());
    const { rerender } = render(
      <form onSubmit={submit}>
        <Button>Save</Button>
      </form>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(submit).not.toHaveBeenCalled();
    rerender(
      <form onSubmit={submit}>
        <Button type="submit">Save</Button>
      </form>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(submit).toHaveBeenCalledOnce();
  });

  it('preserves native field refs, changes and accessible validation relationships', () => {
    const ref = createRef<HTMLInputElement>();
    const change = vi.fn();
    render(
      <Input
        ref={ref}
        aria-label="Name"
        aria-invalid="true"
        aria-describedby="name-error"
        required
        onChange={change}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(ref.current).toBe(input);
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'name-error');
    fireEvent.change(input, { target: { value: 'Harbor' } });
    expect(change).toHaveBeenCalledOnce();
  });

  it('preserves native disabled controls and explicit variants', () => {
    render(
      <>
        <Button disabled variant="secondary" size="compact">
          Previous
        </Button>
        <Select aria-label="Center" disabled>
          <option>Harbor</option>
        </Select>
      </>,
    );
    const button = screen.getByRole('button', { name: 'Previous' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('data-variant', 'secondary');
    expect(button).toHaveAttribute('data-size', 'compact');
    expect(screen.getByRole('combobox', { name: 'Center' })).toBeDisabled();
  });

  it('keeps notice semantics separate from visual variants', () => {
    render(
      <>
        <Badge variant="success">Available</Badge>
        <Notice as="p" role="alert" tone="warning" variant="inline">
          Check capacity
        </Notice>
      </>,
    );
    expect(screen.getByText('Available')).toHaveAttribute(
      'data-variant',
      'success',
    );
    const notice = screen.getByRole('alert');
    expect(notice.tagName).toBe('P');
    expect(notice).toHaveAttribute('data-variant', 'inline');
    expect(notice).toHaveTextContent('Check capacity');
  });
});
