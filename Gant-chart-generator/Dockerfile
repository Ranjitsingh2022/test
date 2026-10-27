FROM europe-west1-docker.pkg.dev/vf-grp-aib-prd-mirror/dockerhub/node:22-alpine3.18

WORKDIR /Gant-chart-generator

# Copy dependency manifests first
COPY package.json package-lock.json* ./

# Upgrade npm to avoid the "Exit handler never called" npm issue,
# then install production dependencies
#RUN npm install --omit=dev --no-audit --no-fund

# Copy Node application files
COPY index.html /Gant-chart-generator/index.html
#COPY app.py /Gant-chart-generator/app.py
#COPY requirements.txt /Gant-chart-generator/requirements.txt
COPY server.js /Gant-chart-generator/server.js
COPY package.json /Gant-chart-generator/package.json
COPY package-lock.json /Gant-chart-generator/package-lock.json
COPY Logo_Gantt.png /Gant-chart-generator/Logo_Gantt.png
COPY metadata.json /Gant-chart-generator/metadata.json
COPY tsconfig.json /Gant-chart-generator/tsconfig.json

ENV NODE_ENV=production
ENV PORT=8090

EXPOSE 8090

CMD ["node", "server.js"]