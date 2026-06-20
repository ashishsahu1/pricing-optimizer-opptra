import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
    title: 'Signal · Opptra Pricing Optimizer',
  },
  {
    path: 'data',
    loadComponent: () => import('./pages/data/data').then((m) => m.DataPage),
    title: 'All data · Opptra Pricing Optimizer',
  },
  { path: '**', redirectTo: '' },
];
