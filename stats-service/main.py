import os
import sqlite3
from contextlib import closing

import polars as pl
from fastapi import FastAPI, HTTPException, Query

DB_PATH = os.getenv("DB_PATH", "/data/sirene.db")
# Date utilisée par l'INSEE quand la date de création est inconnue
DATE_INCONNUE = "1900-01-01"
app = FastAPI(title="Sirene Stats", version="1.0.0")


def load() -> pl.DataFrame:
    # Lecture brute : aucun GROUP BY côté SQL
    with closing(sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)) as conn:
        return pl.read_database(
            """SELECT siren,
                      activite_principale_unite_legale AS code_activite,
                      etat_administratif_unite_legale  AS etat,
                      tranche_effectifs_unite_legale   AS tranche,
                      date_creation_unite_legale       AS date_creation
               FROM mytable""",
            conn,
        ).with_columns(
            pl.when(pl.col("date_creation") == DATE_INCONNUE)
            .then(None)
            .otherwise(pl.col("date_creation").str.slice(0, 4).cast(pl.Int32, strict=False))
            .alias("annee_creation")
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


@app.get("/api/v1/stats/annees")
def stats_annees(
    code_activite: str | None = None,
    etat: str | None = None,
    debut: int | None = Query(None, description="Première année incluse"),
    fin: int | None = Query(None, description="Dernière année incluse"),
):
    df = load()
    if code_activite:
        df = df.filter(pl.col("code_activite") == code_activite)
    if etat:
        df = df.filter(pl.col("etat") == etat)
    sans_date = df.filter(pl.col("annee_creation").is_null()).height
    df = df.filter(pl.col("annee_creation").is_not_null())
    if debut is not None:
        df = df.filter(pl.col("annee_creation") >= debut)
    if fin is not None:
        df = df.filter(pl.col("annee_creation") <= fin)
    return {
        "nb_entreprises": df.height,
        "nb_sans_date": sans_date,
        "annees": (
            df.group_by("annee_creation")
            .agg(
                pl.len().alias("nb_entreprises"),
                (pl.col("etat") == "A").sum().alias("nb_actives"),
            )
            .sort("annee_creation")
            .with_columns(pl.col("nb_entreprises").cum_sum().alias("cumul"))
            .to_dicts()
        ),
    }


@app.get("/api/v1/stats/annees/{annee}")
def stats_une_annee(annee: int, top: int = Query(10, ge=1, le=2000)):
    df = load().filter(pl.col("annee_creation") == annee)
    if df.is_empty():
        raise HTTPException(404, "Aucune entreprise créée cette année-là")
    return {
        "annee_creation": annee,
        "nb_entreprises": df.height,
        "nb_actives": df.filter(pl.col("etat") == "A").height,
        "top_activites": (
            df.group_by("code_activite")
            .agg(pl.len().alias("nb_entreprises"))
            .sort(["nb_entreprises", "code_activite"], descending=[True, False])
            .head(top)
            .to_dicts()
        ),
    }
