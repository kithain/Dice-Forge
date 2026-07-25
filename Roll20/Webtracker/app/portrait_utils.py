import os
from pathlib import Path

def get_portraits_and_folders(base_dir, rel_path=''):
    """
    Récupère une liste de sous-dossiers et d'images à partir d'un répertoire de base
    et d'un chemin relatif. Cette fonction est utilisée pour naviguer dans l'explorateur
    de portraits.

    Args:
        base_dir (str): Le chemin absolu du répertoire racine où les portraits sont stockés
                        (par exemple, 'static/portraits').
        rel_path (str, optional): Le chemin relatif à l'intérieur du `base_dir` à explorer.
                                  Par défaut, c'est une chaîne vide (racine de `base_dir`).

    Returns:
        dict: Un dictionnaire contenant deux listes :
              - "folders": Une liste des noms de sous-dossiers, triée par ordre alphabétique.
              - "images": Une liste des noms de fichiers d'images, triée par ordre alphabétique.
              Retourne des listes vides si le chemin n'existe pas ou n'est pas un répertoire.
    """
    # Construit le chemin complet en joignant le répertoire de base et le chemin relatif.
    full_path = os.path.join(base_dir, rel_path)
    
    # Vérifie si le chemin complet existe et est bien un dossier. Sinon, retourne un résultat vide.
    if not os.path.exists(full_path) or not os.path.isdir(full_path):
        return {"folders": [], "images": []}
    
    # Liste tous les fichiers et dossiers dans le répertoire spécifié.
    items = os.listdir(full_path)
    
    # Initialise les listes pour stocker les noms des dossiers et des images.
    folders = []
    images = []
    
    # Définit un ensemble d'extensions de fichiers d'images valides pour le filtrage.
    image_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'}
    
    for item in items:
        item_path = os.path.join(full_path, item)
        # Si c'est un dossier, on l'ajoute à la liste des dossiers.
        if os.path.isdir(item_path):
            folders.append(item)
        # Si c'est un fichier, on vérifie si son extension correspond à une image.
        elif os.path.isfile(item_path):
            ext = os.path.splitext(item)[1].lower()
            if ext in image_extensions:
                images.append(item)
    
    # Trie les deux listes par ordre alphabétique pour un affichage cohérent.
    folders.sort()
    images.sort()
    
    return {
        "folders": folders,
        "images": images
    }
