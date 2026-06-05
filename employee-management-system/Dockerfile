FROM serversideup/php:8.2-fpm-nginx

USER root

# Increase Nginx Buffer Size to prevent buffering to temp file
ENV NGINX_CLIENT_BODY_BUFFER_SIZE=50M
ENV NGINX_CLIENT_MAX_BODY_SIZE=50M

COPY . /var/www/html
COPY docker/s6-overlay/ /etc/s6-overlay/
COPY docker/nginx/websocket.conf /etc/nginx/conf.d/websocket.conf

RUN mkdir -p storage/logs bootstrap/cache storage/app/public storage/app/public/track_app \
    storage/framework/cache/data storage/framework/sessions storage/framework/views \
    && chown -R www-data:www-data storage bootstrap/cache storage/app/public public \
    && chmod -R 775 storage bootstrap/cache storage/app/public public \
    && sed -i 's/\r$//' /etc/s6-overlay/s6-rc.d/reverb/run \
    && chmod +x /etc/s6-overlay/s6-rc.d/reverb/run \
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
