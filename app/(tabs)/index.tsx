import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Text as SvgText, G } from 'react-native-svg';
import { useEffect, useRef, useState } from 'react';

import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Category = 'Massas' | 'Fast-food' | 'Oriental' | 'Brasileira' | 'Pizza';

type Restaurant = {
  name: string;
  category: Category;
  emoji: string;
  address?: string;
};

type OverpassElement = {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type Coordinates = { latitude: number; longitude: number };

const categories: Category[] = ['Massas', 'Fast-food', 'Oriental', 'Brasileira', 'Pizza'];
const distanceOptions = [2, 5, 10, 20];
const sliceColors = ['#D9563C', '#E57A3B', '#E5A532', '#769B51', '#388170', '#397D9E', '#6365A7', '#925A9E', '#B55280', '#C94E5A', '#A96A3D', '#6E8B59'];

const slicePath = (index: number, total: number) => {
  const center = 125;
  const radius = 128;
  const step = (Math.PI * 2) / total;
  const start = index * step - step / 2;
  const end = start + step;
  const startX = center + radius * Math.cos(start);
  const startY = center + radius * Math.sin(start);
  const endX = center + radius * Math.cos(end);
  const endY = center + radius * Math.sin(end);
  return `M ${center} ${center} L ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY} Z`;
};

const categoryFromTags = (tags: Record<string, string>): Category => {
  const searchable = `${tags.cuisine ?? ''} ${tags.amenity ?? ''} ${tags.name ?? ''}`.toLowerCase();
  if (/pizza/.test(searchable)) return 'Pizza';
  if (/(sushi|japanese|japan|oriental|chinese|asian|thai)/.test(searchable)) return 'Oriental';
  if (/(pasta|italian|italiana|massa)/.test(searchable)) return 'Massas';
  if (/(burger|hamburg|fast_food|hot.?dog|sandwich|pastel|esfiha|lanch)/.test(searchable)) return 'Fast-food';
  return 'Brasileira';
};

const emojiForCategory = (category: Category) => ({ Massas: '🍝', 'Fast-food': '🍔', Oriental: '🍣', Brasileira: '🍛', Pizza: '🍕' })[category];

const wheelLabelLines = (name: string) => {
  const words = name.split(' ');
  if (words.length < 3) return [name];
  const splitAt = Math.ceil(words.length / 2);
  return [words.slice(0, splitAt).join(' '), words.slice(splitAt).join(' ')];
};

export default function HomeScreen() {
  const [isDark, setIsDark] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [targetDegrees, setTargetDegrees] = useState(1800);
  const [maxDistanceKm, setMaxDistanceKm] = useState(10);
  const [isLocating, setIsLocating] = useState(false);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false);
  const [locationStatus, setLocationStatus] = useState('Jaguariuna como ponto inicial');
  const [locationMode, setLocationMode] = useState<'device' | 'city'>('city');
  const [cityQuery, setCityQuery] = useState('Jaguariuna, SP');
  const [selectedLocationName, setSelectedLocationName] = useState('Jaguariuna-SP');
  const [isSearchingCity, setIsSearchingCity] = useState(false);
  const [hasDeviceLocation, setHasDeviceLocation] = useState(false);
  const [currentCoordinates, setCurrentCoordinates] = useState<Coordinates>({ latitude: -22.7037, longitude: -46.985 });
  const [nearbyRestaurants, setNearbyRestaurants] = useState<Restaurant[]>([]);
  const spinValue = useRef(new Animated.Value(0)).current;

  const theme = isDark
    ? { background: '#101A14', surface: '#1C2B21', softSurface: '#26392B', text: '#FFF8F1', muted: '#B7C6BA', border: '#405644' }
    : { background: '#FFF8F1', surface: '#F9E7D9', softSurface: '#FFFDF9', text: '#243528', muted: '#647064', border: '#D8CEC4' };

  const searchableRestaurants = nearbyRestaurants;
  const availableRestaurants = selectedCategories.length
    ? searchableRestaurants.filter((restaurant) => selectedCategories.includes(restaurant.category))
    : searchableRestaurants;

  const wheelRestaurants = availableRestaurants.slice(0, 12);

  useEffect(() => {
    let cancelled = false;

    const loadPlacesInRadius = async () => {
      setIsLoadingPlaces(true);
      setNearbyRestaurants([]);
      setLocationStatus(`Buscando locais em ate ${maxDistanceKm} km...`);
      const query = `[out:json][timeout:25];(nwr["amenity"~"^(restaurant|fast_food|cafe|food_court)$"](around:${maxDistanceKm * 1000},${currentCoordinates.latitude},${currentCoordinates.longitude}););out center tags;`;
      try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
          body: `data=${encodeURIComponent(query)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          method: 'POST',
        });
        if (!response.ok) throw new Error('Overpass request failed');
        const data: { elements: OverpassElement[] } = await response.json();
        const places = data.elements
          .filter((element) => element.tags?.name && (element.lat ?? element.center?.lat) !== undefined)
          .map((element) => {
            const tags = element.tags!;
            const category = categoryFromTags(tags);
            return { name: tags.name, category, emoji: emojiForCategory(category), address: tags['addr:street'] };
          })
          .filter((place, index, all) => all.findIndex((item) => item.name === place.name) === index)
          .sort((first, second) => first.name.localeCompare(second.name, 'pt-BR'));
        if (!cancelled) {
          setNearbyRestaurants(places);
          setLocationStatus(`${places.length} locais encontrados em ate ${maxDistanceKm} km`);
        }
      } catch {
        if (!cancelled) {
          setNearbyRestaurants([]);
          setLocationStatus('Nao foi possivel consultar os locais agora');
        }
      } finally {
        if (!cancelled) setIsLoadingPlaces(false);
      }
    };
    loadPlacesInRadius();
    return () => { cancelled = true; };
  }, [currentCoordinates, maxDistanceKm]);

  const toggleCategory = (category: Category) => {
    Haptics.selectionAsync();
    setSelectedRestaurant(null);
    setSelectedCategories((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category]
    );
  };

  const updateLocation = async () => {
    setIsLocating(true);
    setSelectedRestaurant(null);
    setLocationStatus('Pedindo permissao...');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationStatus('Localizacao nao permitida');
        return;
      }

      setLocationStatus('Obtendo sua localizacao...');
      const currentLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCurrentCoordinates(currentLocation.coords);
      setHasDeviceLocation(true);
      setLocationMode('device');
      setSelectedLocationName('Sua localizacao');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setLocationStatus('Nao foi possivel obter sua localizacao');
    } finally {
      setIsLocating(false);
    }
  };

  const selectCity = async () => {
    const city = cityQuery.trim();
    if (!city) return;
    setIsSearchingCity(true);
    setSelectedRestaurant(null);
    setLocationStatus('Localizando cidade...');
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(city)}`);
      if (!response.ok) throw new Error('City search failed');
      const places: { lat: string; lon: string; display_name: string }[] = await response.json();
      if (!places[0]) {
        setLocationStatus('Cidade nao encontrada');
        return;
      }
      setCurrentCoordinates({ latitude: Number(places[0].lat), longitude: Number(places[0].lon) });
      setHasDeviceLocation(false);
      setLocationMode('city');
      setSelectedLocationName(places[0].display_name.split(',').slice(0, 2).join(','));
    } catch {
      setLocationStatus('Nao foi possivel localizar essa cidade');
    } finally {
      setIsSearchingCity(false);
    }
  };

  const spin = () => {
    if (isSpinning || availableRestaurants.length === 0) return;

    const winnerIndex = Math.floor(Math.random() * wheelRestaurants.length);
    const winner = wheelRestaurants[winnerIndex];
    const degrees = 2070 - (winnerIndex * 360) / wheelRestaurants.length;
    setIsSpinning(true);
    setSelectedRestaurant(null);
    setTargetDegrees(degrees);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    spinValue.setValue(0);

    Animated.timing(spinValue, {
      toValue: degrees,
      duration: 2200,
      useNativeDriver: true,
    }).start(() => {
      setSelectedRestaurant(winner);
      setIsSpinning(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    });
  };

  const rotation = spinValue.interpolate({
    inputRange: [0, targetDegrees],
    outputRange: ['0deg', `${targetDegrees}deg`],
  });

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>VAMOS DECIDIR?</Text>
            <Text style={[styles.title, { color: theme.text }]}>Rolê-ta</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable accessibilityLabel="Alternar tema" onPress={() => setIsDark((current) => !current)} style={[styles.themeButton, { backgroundColor: theme.softSurface, borderColor: theme.border }]}>
              <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={17} color={theme.text} />
            </Pressable>
            <View style={[styles.locationBadge, { backgroundColor: theme.softSurface }]}>
              <Ionicons name="location" size={15} color="#CA4C2E" />
              <Text numberOfLines={1} style={[styles.locationText, { color: theme.text }]}>{selectedLocationName}</Text>
            </View>
          </View>
        </View>

        <Text style={[styles.subtitle, { color: theme.muted }]}>Gire a roleta e descubra onde comer hoje.</Text>

        <View style={[styles.locationPanel, { backgroundColor: theme.surface }]}>
          <View style={styles.locationPanelText}>
            <Text style={[styles.locationPanelTitle, { color: theme.text }]}>Localizacao</Text>
            <Text style={[styles.locationPanelStatus, { color: theme.muted }]}>{locationStatus}</Text>
          </View>
        </View>
        <View style={styles.locationModes}>
          <Pressable onPress={() => setLocationMode('device')} style={[styles.locationMode, locationMode === 'device' && styles.locationModeSelected]}>
            <Ionicons name="locate-outline" size={16} color={locationMode === 'device' ? '#FFF8F1' : theme.muted} />
            <Text style={[styles.locationModeText, { color: theme.muted }, locationMode === 'device' && styles.locationModeTextSelected]}>Usar local</Text>
          </Pressable>
          <Pressable onPress={() => setLocationMode('city')} style={[styles.locationMode, locationMode === 'city' && styles.locationModeSelected]}>
            <Ionicons name="business-outline" size={16} color={locationMode === 'city' ? '#FFF8F1' : theme.muted} />
            <Text style={[styles.locationModeText, { color: theme.muted }, locationMode === 'city' && styles.locationModeTextSelected]}>Selecionar cidade</Text>
          </Pressable>
        </View>
        {locationMode === 'device' ? (
          <Pressable disabled={isLocating || isLoadingPlaces} onPress={updateLocation} style={({ pressed }) => [styles.locationButton, styles.locationActionButton, (pressed || isLocating || isLoadingPlaces) && styles.locationButtonPressed]}>
            <Ionicons name={hasDeviceLocation ? "locate" : "navigate-outline"} size={17} color="#FFF8F1" />
            <Text style={styles.locationButtonText}>{isLocating || isLoadingPlaces ? 'BUSCANDO' : 'OBTER LOCALIZACAO ATUAL'}</Text>
          </Pressable>
        ) : (
          <View style={[styles.citySearch, { borderColor: theme.border, backgroundColor: theme.softSurface }]}>
            <Ionicons name="search-outline" size={18} color={theme.muted} />
            <TextInput
              accessibilityLabel="Cidade desejada"
              onChangeText={setCityQuery}
              onSubmitEditing={selectCity}
              placeholder="Digite a cidade"
              placeholderTextColor={theme.muted}
              style={[styles.cityInput, { color: theme.text }]}
              value={cityQuery}
            />
            <Pressable disabled={isSearchingCity || isLoadingPlaces} onPress={selectCity} style={styles.citySearchButton}>
              <Text style={styles.citySearchButtonText}>{isSearchingCity ? '...' : 'BUSCAR'}</Text>
            </Pressable>
          </View>
        )}

        <Text style={[styles.distanceLabel, { color: theme.text }]}>Distancia maxima</Text>
        <View style={styles.distanceOptions}>
          {distanceOptions.map((distance) => (
            <Pressable key={distance} disabled={isLoadingPlaces} onPress={() => { setMaxDistanceKm(distance); setSelectedRestaurant(null); }} style={[styles.distanceOption, { borderColor: theme.border, backgroundColor: theme.softSurface }, maxDistanceKm === distance && styles.distanceOptionSelected]}>
              <Text style={[styles.distanceOptionText, { color: theme.muted }, maxDistanceKm === distance && styles.distanceOptionTextSelected]}>ate {distance} km</Text>
            </Pressable>
          ))}
        </View>

<View style={styles.wheelArea}>
  <View style={styles.pointer} />
  <Animated.View style={[styles.wheel, { transform: [{ rotate: rotation }] }]}>
    <Svg height={250} style={styles.wheelSvg} width={250}>
      {/* Desenho das fatias */}
      {wheelRestaurants.map((restaurant, index) => (
        <Path 
          d={slicePath(index, wheelRestaurants.length)} 
          fill={sliceColors[index % sliceColors.length]} 
          key={`slice-${restaurant.name}`} 
          stroke="#FFF8F1" 
          strokeWidth="1.4" 
        />
      ))}
      
      {/* Texto em linha única com tamanho de fonte dinâmico */}
      {wheelRestaurants.map((restaurant, index) => {
        const totalSlices = wheelRestaurants.length;
        const sliceAngle = 360 / totalSlices;
        
        // Ângulo que já valida o centro perfeito das cores
        const middleAngle = (index * sliceAngle) - 90;
        
        // 1. Define a fonte base dependendo do número de fatias da roleta
        const baseFontSize = totalSlices > 10 ? 7.5 : totalSlices > 8 ? 9 : 11;
        const nameLength = restaurant.name.length;
        
        // 2. Ajusta a fonte dinamicamente baseado no tamanho total do nome
        let dynamicFontSize = baseFontSize;
        if (nameLength > 22) {
          dynamicFontSize = baseFontSize * 0.55; // Nomes gigantescos encolhem bastante
        } else if (nameLength > 16) {
          dynamicFontSize = baseFontSize * 0.70; // Nomes longos encolhem moderadamente
        } else if (nameLength > 10) {
          dynamicFontSize = baseFontSize * 0.85; // Nomes médios encolhem de leve
        }

        // 3. Posição vertical fixa para linha única centralizada na fatia
        const currentY = 50;

        return (
          <G key={`group-${restaurant.name}-${index}`} rotation={middleAngle} origin="125, 125">
            <SvgText
              fill="#FFF8F1"
              fontSize={dynamicFontSize}
              fontWeight="900"
              textAnchor="middle"
              x={125}
              y={currentY}
              // Rotaciona a string inteira em 90 graus no próprio eixo vertical
              transform={`rotate(90 125 ${currentY})`}
            >
              {restaurant.name}
            </SvgText>
          </G>
        );
      })}
    </Svg>
    <View style={styles.wheelCenter}><Text style={styles.centerText}>🍴</Text></View>
  </Animated.View>
</View>



        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Girar roleta"
          disabled={isSpinning}
          onPress={spin}
          style={({ pressed }) => [styles.spinButton, (pressed || isSpinning) && styles.spinButtonPressed]}>
          <Ionicons name="sync" size={22} color="#FFF8F1" />
          <Text style={styles.spinButtonText}>{isSpinning ? 'SORTEANDO...' : 'GIRAR A ROLETA'}</Text>
        </Pressable>

        {selectedRestaurant ? (
          <View style={[styles.resultCard, { backgroundColor: theme.surface }]}>
            <Text style={styles.resultOverline}>O SEU ROLÊ É NO</Text>
            <Text style={styles.resultEmoji}>{selectedRestaurant.emoji}</Text>
            <Text style={[styles.resultName, { color: theme.text }]}>{selectedRestaurant.name}</Text>
            <View style={styles.categoryPill}><Text style={styles.categoryPillText}>{selectedRestaurant.category}</Text></View>
          </View>
        ) : (
          <View style={styles.resultPlaceholder}>
            <Ionicons name="sparkles-outline" size={20} color="#AA8C7B" />
            <Text style={[styles.placeholderText, { color: theme.muted }]}>Sua próxima refeição está a um giro de distância.</Text>
          </View>
        )}

        <View style={styles.filterHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Qual é a vontade?</Text>
          {selectedCategories.length > 0 && (
            <Pressable onPress={() => { setSelectedCategories([]); setSelectedRestaurant(null); }}><Text style={styles.clearText}>Limpar</Text></Pressable>
          )}
        </View>
        <Text style={[styles.filterDescription, { color: theme.muted }]}>Escolha uma ou mais opções para filtrar a roleta.</Text>
        <View style={styles.chips}>
          {categories.map((category) => {
            const isSelected = selectedCategories.includes(category);
            return (
              <Pressable key={category} onPress={() => toggleCategory(category)} style={[styles.chip, { backgroundColor: theme.softSurface, borderColor: theme.border }, isSelected && styles.chipSelected]}>
                {isSelected && <Ionicons name="checkmark" size={15} color="#FFF8F1" />}
                <Text style={[styles.chipText, { color: theme.muted }, isSelected && styles.chipTextSelected]}>{category}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.countText, { color: theme.muted }]}>{availableRestaurants.length} lugares na roleta</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF8F1' },
  content: { padding: 24, paddingBottom: 36 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  themeButton: { alignItems: 'center', borderRadius: 20, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 },
  eyebrow: { color: '#CA4C2E', fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: '#243528', fontSize: 38, fontWeight: '900', letterSpacing: -1.7, marginTop: -3 },
  locationBadge: { alignItems: 'center', backgroundColor: '#F9E7D9', borderRadius: 20, flexDirection: 'row', gap: 4, paddingHorizontal: 11, paddingVertical: 7 },
  locationText: { color: '#8C3C2B', fontSize: 12, fontWeight: '700' },
  subtitle: { color: '#647064', fontSize: 16, lineHeight: 23, marginTop: 10, maxWidth: 270 },
  locationPanel: { alignItems: 'center', backgroundColor: '#F9E7D9', borderRadius: 16, flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, padding: 12 },
  locationPanelText: { flex: 1, paddingRight: 8 },
  locationPanelTitle: { color: '#77402D', fontSize: 12, fontWeight: '900' },
  locationPanelStatus: { color: '#9B6B5B', fontSize: 12, marginTop: 2 },
  locationButton: { alignItems: 'center', backgroundColor: '#CA4C2E', borderRadius: 11, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 10 },
  locationButtonPressed: { opacity: .7 },
  locationButtonText: { color: '#FFF8F1', fontSize: 10, fontWeight: '900', letterSpacing: .4 },
  locationModes: { flexDirection: 'row', gap: 8, marginTop: 10 },
  locationMode: { alignItems: 'center', borderColor: '#526B59', borderRadius: 12, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 43, paddingHorizontal: 8 },
  locationModeSelected: { backgroundColor: '#243528', borderColor: '#243528' },
  locationModeText: { fontSize: 12, fontWeight: '800' },
  locationModeTextSelected: { color: '#FFF8F1' },
  locationActionButton: { justifyContent: 'center', marginTop: 10, minHeight: 44 },
  citySearch: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', marginTop: 10, minHeight: 46, paddingLeft: 11 },
  cityInput: { flex: 1, fontSize: 14, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 10 },
  citySearchButton: { alignItems: 'center', backgroundColor: '#CA4C2E', alignSelf: 'stretch', borderBottomRightRadius: 11, borderTopRightRadius: 11, justifyContent: 'center', minWidth: 65 },
  citySearchButtonText: { color: '#FFF8F1', fontSize: 10, fontWeight: '900' },
  distanceLabel: { color: '#243528', fontSize: 14, fontWeight: '900', marginTop: 18 },
  distanceOptions: { flexDirection: 'row', gap: 8, marginTop: 9 },
  distanceOption: { borderColor: '#D8CEC4', borderRadius: 13, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  distanceOptionSelected: { backgroundColor: '#243528', borderColor: '#243528' },
  distanceOptionText: { color: '#687468', fontSize: 11, fontWeight: '800' },
  distanceOptionTextSelected: { color: '#FFF8F1' },
  wheelArea: { alignItems: 'center', height: 294, justifyContent: 'center', marginTop: 14 },
  pointer: { borderBottomWidth: 0, borderColor: 'transparent', borderLeftWidth: 16, borderRightWidth: 16, borderTopColor: '#CA4C2E', borderTopWidth: 31, height: 0, position: 'absolute', top: 0, width: 0, zIndex: 2 },
  wheel: { alignItems: 'center', backgroundColor: '#243528', borderColor: '#FFF8F1', borderRadius: 125, borderWidth: 7, height: 250, justifyContent: 'center', overflow: 'hidden', width: 250 },
  wheelSvg: { left: 0, position: 'absolute', top: 0 },
  wheelCenter: { alignItems: 'center', backgroundColor: '#FFF8F1', borderColor: '#243528', borderRadius: 35, borderWidth: 4, height: 70, justifyContent: 'center', width: 70, zIndex: 2 },
  centerText: { fontSize: 28 },
  spinButton: { alignItems: 'center', backgroundColor: '#243528', borderRadius: 16, flexDirection: 'row', gap: 10, justifyContent: 'center', minHeight: 58, shadowColor: '#243528', shadowOffset: { width: 0, height: 6 }, shadowOpacity: .16, shadowRadius: 10 },
  spinButtonPressed: { opacity: .75, transform: [{ scale: .98 }] },
  spinButtonText: { color: '#FFF8F1', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  resultCard: { alignItems: 'center', backgroundColor: '#F9E7D9', borderRadius: 20, marginTop: 18, padding: 18 },
  resultOverline: { color: '#A94A32', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  resultEmoji: { fontSize: 31, marginTop: 5 },
  resultName: { color: '#243528', fontSize: 23, fontWeight: '900', marginTop: 2 },
  categoryPill: { backgroundColor: '#F0C7A6', borderRadius: 12, marginTop: 8, paddingHorizontal: 10, paddingVertical: 4 },
  categoryPillText: { color: '#77402D', fontSize: 11, fontWeight: '800' },
  resultPlaceholder: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 21, paddingHorizontal: 15 },
  placeholderText: { color: '#8D837A', fontSize: 13, fontStyle: 'italic' },
  filterHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginTop: 30 },
  sectionTitle: { color: '#243528', fontSize: 20, fontWeight: '900', letterSpacing: -.4 },
  clearText: { color: '#CA4C2E', fontSize: 13, fontWeight: '800' },
  filterDescription: { color: '#748074', fontSize: 13, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 14 },
  chip: { alignItems: 'center', borderColor: '#D8CEC4', borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 13, paddingVertical: 9 },
  chipSelected: { backgroundColor: '#CA4C2E', borderColor: '#CA4C2E' },
  chipText: { color: '#526054', fontSize: 13, fontWeight: '700' },
  chipTextSelected: { color: '#FFF8F1' },
  countText: { color: '#9B8D81', fontSize: 12, fontWeight: '600', marginTop: 15, textAlign: 'center' },
});
