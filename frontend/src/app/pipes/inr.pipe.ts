import { Pipe, PipeTransform } from '@angular/core';

/** Formats a number as Indian Rupees, e.g. 1299 -> "Rs.1,299". */
@Pipe({ name: 'inr', standalone: true })
export class InrPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '—';
    }
    return 'Rs.' + Math.round(value).toLocaleString('en-IN');
  }
}
