#!/usr/bin/env bash
# .platform/hooks/postdeploy/00_get_certificate.sh
sudo certbot -n -d intex-1-7.is404.net --nginx --agree-tos --email mpw46@byu.edu