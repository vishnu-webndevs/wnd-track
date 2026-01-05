FROM serversideup/php:8.2-fpm-nginx

# Copy application files
COPY . /var/www/html

# Install dependencies
RUN composer install --no-interaction --optimize-autoloader --no-dev

# Set permissions
RUN chown -R webuser:webgroup /var/www/html

# Switch to non-root user
USER webuser

# Healthcheck for Laravel health endpoint
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -fsS http://localhost/up || exit 1
