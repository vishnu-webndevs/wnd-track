FROM serversideup/php:8.2-fpm-nginx

USER root

# Copy application
COPY . /var/www/html

# Prepare Laravel
RUN mkdir -p storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache \
    && composer install \
        --no-interaction \
        --optimize-autoloader \
        --no-dev \
        --no-scripts

# Switch to valid user
USER www-data

RUN php artisan package:discover --ansi

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS http://localhost/up || exit 1
