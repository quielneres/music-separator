import unittest
from pathlib import Path
import urllib.parse
import urllib.request
import json

BASE_URL = "http://localhost:8000"

class TestAudioEngineAPI(unittest.TestCase):
    
    def test_01_healthcheck(self):
        """Verifica se o motor de áudio está ativo e respondendo"""
        url = f"{BASE_URL}/health"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data.get("status"), "ok")

    def test_02_library_listing(self):
        """Verifica se o endpoint /library lista as faixas disponíveis e seus stems"""
        url = f"{BASE_URL}/library"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as resp:
            self.assertEqual(resp.status, 200)
            songs = json.loads(resp.read().decode())
            self.assertIsInstance(songs, list)
            self.assertGreater(len(songs), 0, "Deveria haver faixas já separadas na biblioteca")
            
            # Valida estrutura de cada faixa
            for song in songs:
                self.assertIn("id", song)
                self.assertIn("name", song)
                self.assertIn("stems", song)
                self.assertIsInstance(song["stems"], list)
                self.assertGreater(len(song["stems"]), 0)

    def test_03_serve_stems_audio(self):
        """Verifica se os arquivos .wav são servidos com HTTP 200, Range e Content-Type de áudio"""
        output_dir = Path("output")
        folders = [d for d in output_dir.iterdir() if d.is_dir()]
        self.assertTrue(len(folders) > 0, "Pasta output não pode estar vazia")
        
        # Testar as 3 primeiras pastas (incluindo as que têm espaços e caracteres especiais)
        for folder in folders[:3]:
            wav_files = list(folder.glob("*.wav"))
            if not wav_files:
                continue
            
            sample_stem = wav_files[0].name
            encoded_folder = urllib.parse.quote(folder.name)
            encoded_stem = urllib.parse.quote(sample_stem)
            
            url = f"{BASE_URL}/output/{encoded_folder}/{encoded_stem}"
            req = urllib.request.Request(url, method="HEAD")
            
            with urllib.request.urlopen(req, timeout=5) as resp:
                self.assertEqual(resp.status, 200, f"Falha ao carregar áudio em {url}")
                content_type = resp.headers.get("content-type", "")
                self.assertTrue(
                    "audio" in content_type or "wav" in content_type,
                    f"Content-type deveria ser de áudio, recebido: {content_type}"
                )
                self.assertEqual(resp.headers.get("accept-ranges"), "bytes")
                content_length = int(resp.headers.get("content-length", 0))
                self.assertGreater(content_length, 100000, "Arquivo WAV não pode estar vazio")

    def test_04_special_characters_url_encoding(self):
        """Verifica especificamente URLs com espaços, parênteses e acentos"""
        special_folders = [
            d.name for d in Path("output").iterdir() 
            if d.is_dir() and (" " in d.name or "(" in d.name or "ç" in d.name.lower())
        ]
        
        for folder_name in special_folders:
            encoded_folder = urllib.parse.quote(folder_name)
            url = f"{BASE_URL}/output/{encoded_folder}/vocals.wav"
            req = urllib.request.Request(url, method="HEAD")
            with urllib.request.urlopen(req, timeout=5) as resp:
                self.assertEqual(resp.status, 200, f"Deveria carregar com sucesso a pasta com caracteres especiais: {folder_name}")

if __name__ == "__main__":
    unittest.main()
