FROM serversideup/php:8.2-fpm-nginx
ARG APP_DEBUG=false
ARG APP_ENV=production
ARG APP_KEY=base64:/UVQm5dRfVcL+0cuc+SB5zN7G/NU+hiOLRcqsRGl32s=
ARG APP_NAME=Tracker
ARG APP_URL=https://tracker.webndevs.com
ARG DB_CONNECTION=mysql
ARG DB_DATABASE=wnd_tracker_db
ARG DB_HOST=p00kwwcgg4ck4g08sggc8scg
ARG DB_PASSWORD=wnd@2025
ARG DB_PORT=3306
ARG DB_USERNAME=wnd_tracker
ARG SANCTUM_STATEFUL_DOMAINS=tracker.webndevs.com
ARG SESSION_DOMAIN=.webndevs.com
ARG SESSION_DRIVER=database
ARG COOLIFY_BRANCH=main
ARG COOLIFY_RESOURCE_UUID=ykg0o0c8ck440gsc4ggsoss0

USER root

COPY . /var/www/html

RUN mkdir -p storage/logs bootstrap/cache storage/app/public \
    storage/framework/cache/data storage/framework/sessions storage/framework/views \
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

VOLUME ["/var/www/html/storage"]

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS http://localhost:8080/up || exit 1