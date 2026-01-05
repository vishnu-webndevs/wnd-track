FROM serversideup/php:8.2-fpm-nginx

USER root

USER root

# Copy application files
COPY . /var/www/html
RUN mkdir -p /var/www/html/storage/logs /var/www/html/bootstrap/cache \
    && chmod -R 0777 /var/www/html/storage /var/www/html/bootstrap/cache \
    && composer install --no-interaction --optimize-autoloader --no-dev --no-scripts

# Set permissions
# Using world-writable for storage and cache to accommodate non-root runtime user

USER webuser

RUN php artisan package:discover --ansi

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -fsS http://localhost/up || exit 1
