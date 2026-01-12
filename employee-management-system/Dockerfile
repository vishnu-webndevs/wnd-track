FROM serversideup/php:8.2-fpm-nginx

USER root

COPY . /var/www/html

RUN mkdir -p storage/logs bootstrap/cache storage/app/public \
    && chown -R www-data:www-data storage bootstrap/cache storage/app/public public \
    && chmod -R 775 storage bootstrap/cache storage/app/public public \
    && composer install \
        --no-interaction \
        --optimize-autoloader \
        --no-dev \
        --no-scripts \
    && php artisan storage:link || true \
    && chown -h www-data:www-data public/storage

USER www-data

RUN php artisan package:discover --ansi

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS http://localhost:8080/up || exit 1
