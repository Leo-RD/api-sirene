import os
import sqlite3
from contextlib import closing

import polars as pl
from fastapi import FastAPI, HTTPException, Query

DB_PATH = os.getenv("DB_PATH", "/data/sirene.db")
app = FastAPI(title="Sirene Stats", version="1.0.0")


def load() -> pl.DataFrame:
    # Lecture brute : aucun GROUP BY côté SQL
    with closing(sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)) as conn:
        return pl.read_database(
            """SELECT siren,
                      activite_principale_unite_legale AS code_activite,
                      etat_administratif_unite_legale  AS etat,
                      tranche_effectifs_unite_legale   AS tranche
               FROM mytable""",
            conn,
        )


@app.get("/api/v1/stats/activites")
def stats_activites(top: int = Query(20, ge=1, le=2000), etat: str | None = None):
    df = load()
    if etat:
        df = df.filter(pl.col("etat") == etat)
    return (
        df.group_by("code_activite")
        .agg(
            pl.len().alias("nb_entreprises"),
            (pl.col("etat") == "A").sum().alias("nb_actives"),
        )
        .with_columns(
            (pl.col("nb_entreprises") / pl.col("nb_entreprises").sum() * 100)
            .round(2).alias("part_pct")
        )
        .sort("nb_entreprises", descending=True)
        .head(top)
        .to_dicts()
    )


@app.get("/api/v1/stats/activites/{code}")
def stats_une_activite(code: str):
    df = load().filter(pl.col("code_activite") == code)
    if df.is_empty():
        raise HTTPException(404, "Code activité inconnu")
    return {
        "code_activite": code,
        "nb_entreprises": df.height,
        "par_etat": df.group_by("etat").len().to_dicts(),
        "par_tranche_effectifs": df.group_by("tranche").len().sort("tranche").to_dicts(),
    }
