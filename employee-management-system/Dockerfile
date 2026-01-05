FROM serversideup/php:8.2-fpm-nginx

# Install additional extensions if needed
# RUN docker-php-ext-install bcmath

# Copy application files
COPY . /var/www/html

# Install dependencies
RUN composer install --no-interaction --optimize-autoloader --no-dev

# Set permissions
RUN chown -R webuser:webgroup /var/www/html

# Switch to non-root user
USER webuser
