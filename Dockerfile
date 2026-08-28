FROM python:3.13-alpine

WORKDIR /app
ENV PATH="/app:${PATH}"
COPY memento docker-entrypoint.py ./
RUN chmod 755 /app/memento /app/docker-entrypoint.py

EXPOSE 7337
VOLUME ["/data"]

ENTRYPOINT ["python3", "/app/docker-entrypoint.py"]
CMD ["serve-http", "--root", "/data", "--host", "0.0.0.0", "--port", "7337"]
