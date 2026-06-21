import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly username = signal('');
  readonly password = signal('');
  readonly error = signal<string | null>(null);

  submit(): void {
    this.error.set(null);
    const ok = this.auth.login(this.username(), this.password());
    if (!ok) {
      this.error.set('Invalid username or password.');
      return;
    }
    const redirect = this.route.snapshot.queryParamMap.get('redirect') || '/';
    this.router.navigateByUrl(redirect);
  }
}
